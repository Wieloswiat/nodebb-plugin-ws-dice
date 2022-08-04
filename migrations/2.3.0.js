'use strict';

const { scan, setObjectBulk, getObjects } = require.main.require('./src/database');
async function useSpan() {
	const migrationRegex = /^(?!<span class="dice-event-text">).+/;
	const keys = await scan({ match: 'topicEvent:*' });
	const events = await getObjects(keys);
	const modifiedEvents = events
		.map((event, index) => [keys[index], event])
		.filter(event => event[1].type === 'dice' && migrationRegex.test(event[1].text))
		.map(
			(event) => {
				event[1].text = `<span class="dice-event-text">${event[1].text}</span>`;
				return event;
			},
		);
	await setObjectBulk(modifiedEvents);
}

module.exports = useSpan;
