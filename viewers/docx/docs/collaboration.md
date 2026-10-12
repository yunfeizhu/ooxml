# Collaboration protocol

The web component supports two exclusive collaboration modes: authority-ordered ProseMirror steps, and opt-in Yjs merging through an application-owned `CollabSession`. Both use the same editor and six framework adapters. The host owns transport, authentication, persistence and export timing.

## Live demo: two windows, any framework

A session is just a name. The two panes below are separate demo apps built from different framework adapters (React and Vue) that join the session `docs-collab`: the first pane opens the sample document and hosts the session, the second joins by name and receives the document, every edit and the other person's cursor. Type in either pane.

<iframe
	src="/ooxml/docx/demo/?sample=1&room=docs-collab&name=Ada"
	title="docx-viewer session host (React)"
	loading="lazy"
	style="width: 100%; height: 640px; border: 1px solid var(--vp-c-divider); border-radius: 8px"
></iframe>

<iframe
	src="/ooxml/docx/demo-vue/?room=docs-collab&name=Grace"
	title="docx-viewer session guest (Vue)"
	loading="lazy"
	style="width: 100%; height: 640px; border: 1px solid var(--vp-c-divider); border-radius: 8px; margin-top: 1rem"
></iframe>

### Pair any two frameworks

Every demo accepts `?room=<session>`. The window that also asks for `sample=1` hosts the session; any other window with the same `room` joins it, in whichever framework it was built with. The home page [live demo](/#live-demo) has a framework picker for each window, and in two tabs you can open, for example, `/demo-angular/?sample=1&room=my-room` and `/demo-svelte/?room=my-room`.

### How the demo does it, and why it is same-browser only

The editor's protocol is transport-neutral, so the demo supplies the transport: a `BroadcastChannel` named after the session. The host window runs the in-memory reference authority (`createCollaborationAuthority`), orders everybody's step batches and broadcasts the accepted ones; a guest starts from the host's starting document and replays the accepted batches, so the framework of each window does not matter. A `BroadcastChannel` connects windows, tabs and frames of one browser profile and nothing else, the session ends when its host window closes, and nothing is persisted. For people on different machines your application must provide the transport, authority, identity and storage (see below).

There is also a [single-page demo](/demo/collaboration.html){target="_self"} with two editors in one page and a **Pause delivery** button for trying concurrent edits; add `?guest=vue` to run its second editor in another framework.

## What is and is not supported

| Supported                                                                     | Not supported                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Ordered, validated ProseMirror step batches through an authority              | A hosted server, networking, authentication or persistence (the host owns these) |
| Yjs text/formatting merging, relative cursors, comment threads and local undo | Concurrent editing of styles, numbering definitions and notes outside the body   |
| A reference in-memory authority for tests and the local demo                  | Structural table commands while collaborating                                    |

## Yjs mode

Load the same source DOCX package in each editor, including its media, styles,
comments, notes and opaque parts. The host supplies a stable `documentId` for
that package and designates exactly one room creator. This identifier is a host
contract, not an authentication token or an automatic package checksum.

```ts
import { createCollabSession, transportProvider } from 'ooxml-core/collab';

const session = createCollabSession({
	roomId,
	provider: transportProvider({ transport }), // Application-owned transport
	user: { name: 'Ada', role: 'collaborator' },
});
if (!session.synced) {
	await new Promise<void>((resolve) => {
		const off = session.on('synced', (synced) => {
			if (synced) {
				off();
				resolve();
			}
		});
	});
}
editor.startYjsCollaboration(session, {
	documentId: sourcePackageId,
	initializeIfEmpty: designatedCreator,
});
editor.publishPresence({ name: 'Ada', color: '#2563eb' });
```

Wait for actual initial provider synchronization, rather than the grace-period
write gate, before joining. The creator seeds an empty room; other participants
adopt the existing body and page/section attributes instead of overwriting them
with a local snapshot. A mismatched document ID or room format rejects the join.
An authority session and a Yjs session cannot control one editor simultaneously.

The current shared Word schema initializes `word-yjs-v3` rooms. Each modeled
direct property of a picture, note reference, field marker or break has an
independent attribute over its imported property basis. Concurrent changes to
different properties merge, including property removal; local undo retains the
other author's changes. Same-property conflicts follow Yjs ordering. Formatting
history still has one prior snapshot and author per run; complete concurrent
multi-author review attribution remains unfinished.

This changes room compatibility: the updated viewer rejects v1 and v2 rooms, and old clients reject v3 rooms. Core consumers using legacy schemas can still use matching v1/v2 rooms, with text comment authoring only. To upgrade a persisted room, export its current DOCX with the matching old client, load that package in updated clients, and let the designated creator initialize a new empty v3 room. Keep every participant on the matching schema. The binding does not rewrite a live room or migrate provider persistence automatically.

The Yjs mode uses the stable Yjs 13 binding, `y-prosemirror` 1.3.7. Root document
attributes have a separate mapping because the binding does not synchronize
them. Text, formatting and tracked revision marks travel through the body
fragment. Newly inserted PNG, JPEG, GIF, BMP and SVG picture parts use the shared
core asset routing with raw binary payloads; names are unique per client and
parts are immutable. Picture bytes remain available for undo/redo and exports
after stopping collaboration. Existing package assets remain in each editor's
matching loaded source. The host still controls export synchronization and room
persistence; this does not coordinate simultaneous saves or prove lossless export.

The Track Changes recording setting also travels through document transactions.
Toggling it updates peers, participates in local undo/redo and exports as
`w:trackRevisions`. Joining a compatible room that lacks the setting retains the
loaded package value until a participant changes it. Revision marks retain the
editing author's name and the recording transaction's UTC timestamp. Peers
retain those values rather than reattributing remote edits; client-supplied
names and clocks do not authenticate authorship or time.

Ctrl/Cmd+Z and ribbon undo use local Yjs history. Ordinary editing also keeps thread records and anchors in undoable transactions; local thread snapshots are excluded from Yjs document attributes. After stopping Yjs, its current threads become the ordinary history snapshot. History survives editor detach
and remount; disconnected views adopt changes on remount. Awareness uses relative
positions for cursor/selection mapping, with the existing localized cursor UI.
`publishPresence` updates the awareness profile and returns `null` in Yjs mode;
`leavePresence` clears the cursor. The provider transports awareness directly,
so `presence-send` and `receivePresence` remain authority-mode APIs.

`reconnectCollaboration()` restarts the Yjs provider while retaining the shared
document. `resyncCollaboration()` requests state exchange and returns `false`
when the provider cannot do so. The host can also use `session.connect()`,
`disconnect()`, `peers()`, status/sync/error subscriptions and `destroy()`.
`stopCollaboration()` detaches the Word binding and retains its current content
and new picture assets, including while unmounted; it does not destroy the
host-owned session. Destroy that session when the host leaves the room.

Read-only editors and viewer roles receive remote updates while blocking local
document writes. Client roles are advisory: enforce authorization in the server
or provider as well. Editing outside the body and structural table commands
remain disabled. Page and section attributes are preserved and synchronized,
but multi-story collaboration and a complete package bootstrap are unfinished.

New Yjs rooms also share comment anchors, replies, resolution and deletion through
the existing review pane. The creator seeds the loaded comments. Each comment has
independent text attributes, element-relative ranges and a record; concurrent replies retain their own
IDs. Resolution uses Yjs map conflict ordering. Deleting a root hides its replies,
including replies written concurrently while offline. Undo restores the root and
its anchor together and reveals surviving replies; each author's undo retains
other authors' operations. Export snapshots the latest shared threads even while
the editor is detached.

V3 rooms carry an `inline-relative-v1` comment capability in their Word identity map. Pictures, breaks, note references and field markers retain independent anchors through concurrent additions, deletions, neighboring text edits and local undo. Imported anchors seed these ranges when a new room is created. Commenting on a result or marker of a balanced complex field covers the complete field, matching the recorded native Word behavior. Matching legacy rooms retain their `independent-v1` text-only capability.
Compatible rooms without it keep their loaded comments and disable comment editing.
Create a new room from a canonical saved snapshot to upgrade; do not change the
capability on a live room. Authority-step mode does not synchronize comment
metadata, so its comment editing remains disabled. These client behaviors do not
provide server authorization, durable persistence or modern Word comment mentions,
notifications and task assignment.

Try the [Yjs two-peer demo](/demo/collaboration.html?mode=yjs){target="_self"}.
Its Pause delivery, Reconnect providers and Resync providers actions exercise
in-memory recovery. It provides no production networking or durable storage.

## Protocol

The web component exposes `startCollaboration`, `getPendingCollaboration`, `receiveCollaboration`, and `stopCollaboration`. Hosts can use `createCollaborationAuthority(model, options)` to create the in-memory reference authority with the same schema and model conversion as the editor.

## Client and host flow

All participants editing the same document use the same `sessionId`; every editor incarnation uses a unique `clientId`. Reusing a client ID can make peers mistake each other's steps for acknowledgements. All participants must use the same schema and starting document. To join an existing authority, initialize the client with its current version and canonical document:

```ts
const client = new CollaborationClient({ sessionId, clientId, version: currentVersion });
const state = EditorState.create({ doc: canonicalDoc, plugins: [history(), client.plugin] });
```

For the custom element, call `editor.startCollaboration({ sessionId, clientId, version })` after loading the matching model snapshot. Keep each receiver mounted while it participates: `receiveCollaboration` applies through the live editor view. Listen for `collaboration-send`; submit each `StepBatch` to the authority and deliver its accepted batch to every editor with `receiveCollaboration(batch)`. Rejections such as `stale`, `out-of-order`, or `wrong-session` should trigger host-level recovery rather than being silently dropped.

After local transactions, call `client.createPendingBatch(state)`. It returns `null` when there are no unconfirmed steps, and otherwise returns an immutable envelope. Keep retrying that exact envelope until the authority accepts it; do not start another request while it is in flight. The method returns the same envelope until its matching accepted batch is received.

The host submits the envelope to its authority and relays the accepted `batch` to every participant, including the sender. The `version` on an accepted batch is the authority version immediately before the batch's steps. Participants pass the envelope to `client.receive(state, batch)`. On `applied`, dispatch the returned transaction through the editor's usual state-update path. This lets ordinary model updates, status events, and save behavior run for remote changes too. Applying remote batches does not consult the view's read-only setting; that setting blocks local edits only.

The protocol accepts at most 500 steps and 1,000,000 serialized JSON characters per batch. The reference `CollaborationAuthority` is an in-memory ordering and rebase implementation. It accepts current-version requests and maps stale requests through intervening accepted steps. Its default history retains 2,000 steps, and it caches 5,000 request acknowledgements for retries. A stale request older than retained history is rejected; a future version is rejected as out of order. The client remembers the most recent 1,000 received batch IDs to ignore duplicates. Hosts should provide catch-up or reload from their canonical snapshot after a gap, expired version, or rejected oversized batch.

## Presence

`PresenceClient` provides a separate transient channel for peer names, colors, cursors, and selections. It does not use or change the document step stream. Add its `.plugin` beside the collaboration plugin. `publish(state, { name, color })` returns a message for the host transport, or `null` while local document steps are still awaiting acknowledgement. `leave(state)` returns a removal message. After receiving a message, dispatch the transaction from `receive(state, message)` when its status is `applied`; ignore `duplicate` and recover from `stale`, `out-of-order`, or `wrong-session` according to the host policy.

Presence messages carry the shared session ID, sender client ID, committed collaboration version, and a monotonically increasing sequence per sender. Relay messages in order and republish after edit acknowledgement; positions are defined against the message's committed version. The plugin maps existing cursors and selections through subsequent document transactions, including edits received while the editor is read-only. It accepts names up to 80 printable characters, colors from `PRESENCE_PALETTE`, and at most 100 visible peers. Hosts should rate-limit and expire disconnected peers in their transport layer. Presence is not persisted, authenticated, or included in DOCX export.

## Stable identities

For the shared custom element, presence is enabled by `startCollaboration`:

```ts
import { PRESENCE_PALETTE } from 'docx-vanilla-viewer';

editor.addEventListener('presence-send', (event) => {
	transport.sendPresence(event.detail); // Application-owned transport
});
editor.publishPresence({ name: 'Ada', color: PRESENCE_PALETTE[0] });
// Incoming messages: editor.receivePresence(message)
// Explicit departure: editor.leavePresence()
```

The element republishes its stored profile after selection changes and edit
acknowledgements. It returns `out-of-order` for incoming selection positions while
local edits are pending; the host can request fresh presence after synchronization.
Leave messages contain no positions and can remove a peer at a different document
version, while still enforcing session and sender-sequence checks.

Paragraph and table IDs are document content and travel in ProseMirror steps. For local transactions, use `repairCollaborativeDocumentIds(state, clientId, idGenerator)` instead of the non-collaborative ID repair helper. Create `idGenerator` once with `createCollaborationIdGenerator(clientId)` and reuse it for that editor's lifetime; this prevents ID reuse after deletion and namespaces locally inserted table, cell, and paragraph IDs. The host must assign a distinct client ID to every live editor incarnation; the session ID and client ID are protocol identifiers, not credentials.

`stopCollaboration()` requires the pending edits to be acknowledged. If the host intentionally abandons them, call `stopCollaboration(true)` to explicitly discard the local transport queue. Disconnection or unmounting should not be treated as acknowledgement; retain the canonical snapshot/version and resume or recover through the host's transport policy.

## Authority responsibilities and limits

The application host owns transport, authentication and authorization, durable storage, snapshot distribution, client identity, reconnect policy, and export timing. The in-memory authority is useful for tests and a local demo, not as a multi-process or production server. DOCX export should use a canonical, sufficiently synchronized model if the application needs shared-save semantics; this library does not coordinate file locks or simultaneous exports. Remote peers receive only schema-supported ProseMirror steps, and the authority validates those steps before accepting them. Structural table commands are disabled during collaboration because the current table editor replaces table structure as a whole; granular cell-level transactions are needed before enabling those commands safely.

Supported inline picture, break and note links are carried by run attributes,
so importing or editing them does not depend on element marks that Yjs drops.
The Link dialog reads and edits these targets through the same core commands
as ordinary text links. Retargeting and removal are synchronized and support
local author undo; shared picture media remains available in DOCX exports.
Equation links and hyperlink revision attribution remain outside this support.
