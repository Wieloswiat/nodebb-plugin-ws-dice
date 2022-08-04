'use strict';

define('plugins/dice/main', [
	'forum/topic/posts',
	'hooks',
], (posts, hooks) => {
	socket.on('plugins:dice:event:new_roll', (data) => {
		hooks.one('action:posts.loaded', () => posts.addTopicEvents(data));
	});
});
