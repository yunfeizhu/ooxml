import { html } from 'lit';
import type { FollowedThread, TeamsClient, TeamsState } from 'ooxml-core/teams';

export function followedThreads(
	state: TeamsState,
	client: TeamsClient,
	open: (thread: FollowedThread) => void,
	unreadOnly: boolean,
	filter: (unreadOnly: boolean) => void,
) {
	const threads = state.followedThreads.filter((thread) => !unreadOnly || thread.unread > 0);
	return html`<section class="followed-threads" aria-label="Followed threads">
		<h1>Followed threads</h1>
		<p>Threads you follow on this device. Notifications are not enabled.</p>
		<fieldset>
			<legend>Automatically follow</legend>
			<label
				><input
					type="checkbox"
					.checked=${state.threadFollowSettings.started}
					@change=${(event: Event) => client.setThreadFollowSettings({ started: (event.target as HTMLInputElement).checked })}
				/>
				Threads I start</label
			>
			<label
				><input
					type="checkbox"
					.checked=${state.threadFollowSettings.replied}
					@change=${(event: Event) => client.setThreadFollowSettings({ replied: (event.target as HTMLInputElement).checked })}
				/>
				Threads I reply to</label
			>
		</fieldset>
		<label
			><input
				type="checkbox"
				.checked=${unreadOnly}
				@change=${(event: Event) => filter((event.target as HTMLInputElement).checked)}
			/>
			Unread only</label
		>
		<ul>
			${
				threads.length
					? threads.map(
							(thread) =>
								html`<li data-unread=${String(thread.unread > 0)}>
									<button
										type="button"
										@click=${() => open(thread)}
										aria-label=${`Open thread in ${thread.channelName}: ${thread.root.deleted ? 'Deleted message' : thread.root.text}`}
									>
										<strong># ${thread.channelName}</strong
										><span
											>${thread.root.deleted ? 'This message was deleted' : thread.root.text || 'Shared file'}</span
										>
										<small
											>${thread.replyCount} ${thread.replyCount === 1 ? 'reply' : 'replies'} ·
											${new Date(thread.updatedAt).toLocaleString()}</small
										></button
									><span>${thread.unread > 0 ? `${thread.unread} unread` : 'Read'}</span
									><button
										type="button"
										@click=${() => client.markThreadRead(thread.channelId, thread.root.id, thread.unread > 0)}
									>
										${thread.unread > 0 ? 'Mark as read' : 'Mark as unread'}</button
									><button
										type="button"
										@click=${() => client.followThread(thread.channelId, thread.root.id, false)}
									>
										Unfollow thread
									</button>
								</li>`,
						)
					: html`<li>
							${unreadOnly ? 'No unread followed threads.' : 'No followed threads yet. Open a thread and choose Follow thread.'}
						</li>`
			}
		</ul>
	</section>`;
}
