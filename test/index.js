/**
 * You can run these tests by executing `npx mocha test/plugins-installed.js`
 * from the NodeBB root folder. The regular test runner will also run these
 * tests.
 *
 * Keep in mind tests do not activate all plugins, so if you are testing
 * hook listeners, socket.io, or mounted routes, you will need to add your
 * plugin to `config.json`, e.g.
 *
 * {
 *     "test_plugins": [
 *         "nodebb-plugin-ws-dice"
 *     ]
 * }
 */

'use strict';

/* globals describe, it, before */

const assert = require('assert');

const winston = require.main.require('winston');

const topics = require.main.require('./src/topics');
const { search } = require.main.require('./src/search');
const categories = require.main.require('./src/categories');
const user = require.main.require('./src/user');
const plugins = require.main.require('./src/plugins');


describe('nodebb-plugin-ws-dice', () => {
	let authorUid;
	let commenterUid;
	let postData;
	let topicData;
	let responseData;
	let cid;
	before(async () => {
		[authorUid, commenterUid, { cid }] = await Promise.all([
			user.create({ username: 'totalVotesAuthor' }),
			user.create({ username: 'totalVotesCommenter' }),
			categories.create({
				name: 'Test Category',
				description: 'Test category created by testing script',
			}),
		]);
		({ postData, topicData } = await topics.post({
			uid: authorUid,
			cid: cid,
			title: 'Test Meilisearch Topic Title',
			content: 'The content of test topic first post',
		}));

		responseData = await topics.reply({
			uid: commenterUid,
			tid: topicData.tid,
			content: 'The content of test reply',
		});
	});

	it('should roll the dice for a simple case', async () => {
		await topics.reply({
            uid: commenterUid,
            tid: topicData.tid,
            content: '/roll 1d6',
        })
		const events = await topics.events.get(topicData.tid, commenterUid);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].type, 'dice');
        assert(events[0].total <= 6);
        assert(events[0].total >= 1);
	});
});