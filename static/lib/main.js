'use strict';

define('plugins/dice/main', [
	'forum/topic/posts',
	'hooks',
], (posts, hooks) => {
	socket.on('plugins:dice:event:new_roll', (data) => {
		if (Array.isArray(data) && data.length && data.some(e => e.type === 'dice')) {
			for (const event of data) {
				hooks.one('action:posts.loaded', () => posts.addTopicEvents(event));
			}
		}
	});
});
