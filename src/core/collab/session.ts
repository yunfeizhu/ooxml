// A collaboration session: the Y.Doc, the awareness, a provider, the first-write gate, the local
// presence publisher and the derived peer list, behind typed events. DOM-free and product-free:
// the viewer maps its own document onto `session.doc` (see binding.ts) and its own "where am I"
// payload onto presence. New code written for the collab area, combining the per-binding lifecycle
// wiring pptx-viewer repeated five times (provider, gate, heartbeat, teardown, departure).
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { type AwarenessLike, type PresencePublisher, createPresencePublisher } from './awareness';
import { Emitter } from './emitter';
import { type CollaborationRole, assignUserColor, canWrite as roleCanWrite } from './identity';
import { createDepartureChannel, registerTeardown, type TeardownOptions } from './lifecycle';
import { INITIAL_SYNC_GRACE_MS, createSyncGate, type SyncGate } from './policy';
import {
	PRESENCE_HEARTBEAT_MS,
	type PresenceIdentity,
	type RemotePresence,
	derivePresence,
} from './presence';
import {
	CONNECTION_TIMEOUT_MS,
	type ConnectionStatus,
	type ProviderFactory,
	type SyncProvider,
} from './provider';
import { sanitizeColor, sanitizeUserName, validateRoomId } from './validation';

export interface SessionOptions<P extends object = object> {
	roomId: string;
	provider: ProviderFactory;
	user: {
		name: string;
		/** Defaults to a stable palette colour derived from the client id. */
		color?: string;
		avatar?: string;
		role?: CollaborationRole;
	};
	/** Bring your own document (for example one a viewer already populated). */
	doc?: Y.Doc;
	/** The local "where am I" payload published with the identity. */
	initialPresence?: P;
	/** Validate a remote payload; return `null` to hide that peer. Defaults to accepting `{}`. */
	sanitizePayload?: (raw: Record<string, unknown>) => P | null;
	/** Start connecting immediately. Default true. */
	autoConnect?: boolean;
	connectionTimeoutMs?: number;
	/** Fallback gate opening for transports that never signal sync (mesh). Default 3 s. */
	syncGraceMs?: number;
	/** Called once when local writes become allowed; seed the document here. */
	onReady?: (state: { synced: boolean }) => void;
	/** Register pagehide/beforeunload leave handling and the same-browser departure channel. */
	teardown?: boolean | Pick<TeardownOptions, 'target' | 'leaveOnBeforeUnload' | 'leaveMessage'>;
	/** Heartbeat (ms) that republishes presence and ages out stale peers. Default 10 s; 0 disables. */
	heartbeatMs?: number;
}

export interface SessionEvents<P extends object> {
	status: ConnectionStatus;
	synced: boolean;
	/** The remote presence list changed (join, leave, move, staleness). */
	peers: RemotePresence<P>[];
	/** Local writes just became allowed (once per connection epoch). */
	ready: undefined;
	error: Error;
}

export interface CollabSession<P extends object = object> {
	readonly roomId: string;
	readonly doc: Y.Doc;
	readonly awareness: Awareness;
	readonly clientId: number;
	readonly role: CollaborationRole | undefined;
	readonly identity: PresenceIdentity;
	readonly gate: SyncGate;
	readonly provider: SyncProvider;
	readonly status: ConnectionStatus;
	readonly synced: boolean;
	/** Writes are allowed: the gate opened (synced, or the grace period passed), not a viewer, not destroyed. */
	canWrite: () => boolean;
	peers: () => RemotePresence<P>[];
	/** Merge a patch into the published local presence payload (throttled). */
	updatePresence: (patch: Partial<P>) => void;
	on: <K extends keyof SessionEvents<P>>(
		event: K,
		listener: (payload: SessionEvents<P>[K]) => void,
	) => () => void;
	connect: () => void;
	disconnect: () => void;
	/** Restart the connection while retaining the document and queued offline updates. */
	reconnect: () => void;
	/** Request state exchange on an open provider. False when unavailable or disconnected. */
	resync: () => boolean;
	/** Leave the room and release everything; a session created with `doc` leaves that doc alive. */
	destroy: () => void;
}

export function createCollabSession<P extends object = object>(
	options: SessionOptions<P>,
): CollabSession<P> {
	const roomId = validateRoomId(options.roomId);
	const ownsDoc = !options.doc;
	const doc = options.doc ?? new Y.Doc();
	const awareness = new Awareness(doc);
	const events = new Emitter<SessionEvents<P>>();
	const role = options.user.role;
	const identity: PresenceIdentity = {
		userName: sanitizeUserName(options.user.name),
		userColor: sanitizeColor(options.user.color, assignUserColor(doc.clientID)),
		userAvatar: options.user.avatar,
		role,
	};
	const sanitizePayload = options.sanitizePayload ?? ((): P | null => ({}) as P);
	const publisher: PresencePublisher<P> = createPresencePublisher(
		awareness as unknown as AwarenessLike,
		identity,
		(options.initialPresence ?? {}) as P,
	);
	let destroyed = false;
	let timeout: ReturnType<typeof setTimeout> | null = null;

	const gate = createSyncGate(() => {
		if (destroyed) return;
		options.onReady?.({ synced: provider.synced });
		events.emit('ready', undefined);
	}, options.syncGraceMs ?? INITIAL_SYNC_GRACE_MS);

	const peers = (): RemotePresence<P>[] =>
		derivePresence(awareness.getStates(), doc.clientID, sanitizePayload);
	const emitPeers = (): void => events.emit('peers', peers());
	awareness.on('change', emitPeers);

	const provider = options.provider({ doc, awareness, roomId });
	const clearTimeoutTimer = (): void => {
		if (timeout !== null) clearTimeout(timeout);
		timeout = null;
	};
	provider.on('status', (status) => {
		clearTimeoutTimer();
		events.emit('status', status);
		if (status === 'connecting')
			timeout = setTimeout(() => {
				events.emit('error', new Error('Collaboration connection timed out'));
				events.emit('status', 'error');
			}, options.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS);
		if (status === 'connected') gate.arm();
	});
	provider.on('synced', (synced) => {
		events.emit('synced', synced);
		if (synced) gate.open();
	});
	provider.on('error', (error) => events.emit('error', error));

	const heartbeatMs = options.heartbeatMs ?? PRESENCE_HEARTBEAT_MS;
	const heartbeat =
		heartbeatMs > 0
			? setInterval(() => {
					publisher.flush();
					emitPeers();
				}, heartbeatMs)
			: null;
	(heartbeat as { unref?: () => void } | null)?.unref?.();

	const departure = createDepartureChannel(roomId, awareness);
	const leave = (): void => {
		departure.announce();
		publisher.dispose();
		awareness.setLocalState(null);
		provider.disconnect();
	};
	const unregisterTeardown = options.teardown
		? registerTeardown({
				leave,
				rejoin: () => {
					publisher.flush();
					provider.connect();
				},
				...(typeof options.teardown === 'object' ? options.teardown : {}),
			})
		: () => {};

	const session: CollabSession<P> = {
		roomId,
		doc,
		awareness,
		clientId: doc.clientID,
		role,
		identity,
		gate,
		provider,
		get status() {
			return provider.status;
		},
		get synced() {
			return provider.synced;
		},
		canWrite: () => !destroyed && gate.isOpen() && roleCanWrite(role),
		peers,
		updatePresence: (patch) => publisher.update(patch),
		on: (event, listener) => events.on(event, listener),
		connect: () => {
			if (!destroyed) provider.connect();
		},
		disconnect: () => {
			clearTimeoutTimer();
			gate.reset();
			provider.disconnect();
		},
		reconnect: () => {
			if (destroyed) return;
			session.disconnect();
			session.connect();
		},
		resync: () => {
			if (destroyed || provider.status !== 'connected' || !provider.resync) return false;
			provider.resync();
			return true;
		},
		destroy: () => {
			if (destroyed) return;
			departure.announce();
			unregisterTeardown();
			clearTimeoutTimer();
			if (heartbeat !== null) clearInterval(heartbeat);
			publisher.dispose();
			gate.reset();
			awareness.setLocalState(null);
			provider.destroy();
			departure.dispose();
			awareness.off('change', emitPeers);
			awareness.destroy();
			destroyed = true;
			events.clear();
			if (ownsDoc) doc.destroy();
		},
	};
	// External providers can already have completed their handshake before we subscribed.
	if (provider.synced) gate.open();
	else if (provider.status === 'connected') gate.arm();
	if (options.autoConnect !== false && provider.status !== 'connected') provider.connect();
	return session;
}
