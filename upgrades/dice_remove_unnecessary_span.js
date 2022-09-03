'use strict';

const { scan, setObjectBulk, getObjects } = require.main.require('./src/database');
async function removeSpan() {
	const migrationRegex = /^<span class="dice-event-text">(?<text>.+)<\/span>$/;
	const keys = await scan({ match: 'topicEvent:*' });
	const events = await getObjects(keys);
	const modifiedEvents = events
		.map((event, index) => [keys[index], event])
		.filter(event => event[1].type === 'dice' && migrationRegex.test(event[1].text))
		.map(
			(event) => {
				event[1].text = migrationRegex.exec(event[1].text).groups.text;
				return event;
			},
		);
	await setObjectBulk(modifiedEvents);
}

module.exports = {
	name: 'Removing an unnecessary span that was added for styling purposes before',
	timestamp: Date.UTC(2022, 9, 3),
	method: removeSpan,
};
