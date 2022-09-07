'use strict';

const {
	DiceRoller,
	NumberGenerator,
	Parser,
	RollGroup,
	Results: { RollResults },
	Dice: { FudgeDice },
} = require('@dice-roller/rpg-dice-roller');

const { events, getTopicField } = require.main.require('./src/topics');
const { getPostData } = require.main.require('./src/posts');
const { addSystemMessage } = require.main.require('./src/messaging');
const { emitToUids } = require.main.require('./src/socket.io/helpers');
const { getUidsFromSet } = require.main.require('./src/user');
const { filterUids } = require.main.require('./src/privileges/categories');

const escapeCharMap = Object.freeze({
	'&': '&',
	'<': '<',
	'>': '>',
	'"': '”',
	"'": '’',
	'=': '＝',
});

const escapeChars = /[&<>"'=]/g;

const escapeHTML = (str) => {
	if (str == null) {
		return '';
	}
	if (!str) {
		return String(str);
	}
	return str.toString().replace(escapeChars, char => escapeCharMap[char]);
};

const plugin = {};

const dice = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'dF'];

const roller = new DiceRoller();

const { generator } = NumberGenerator;
generator.engines = NumberGenerator.engines.nodeCrypto;

plugin.addTopicEvents = async function ({ types }) {
	types.dice = {
		icon: 'fa-dice',
	};
	return { types };
};

function createText(total, rolls, diceUsed, notation) {
	if (rolls.length === 1 && diceUsed[0].qty === 1) {
		let text = '[[dice:roll-one-die-0]] ';
		let { sides } = diceUsed[0];
		let iconValue = total;
		if (diceUsed[0] instanceof FudgeDice) {
			sides = 'F';
			// eslint-disable-next-line no-nested-ternary
			iconValue = total === 1 ? 'plus' : (total === -1 ? 'minus' : 'zero');
		}
		if (dice.includes(`d${sides}`)) {
			text += `<i class="df-d${sides}-${iconValue} df-event-icon"></i><span class="df-icon-text">${total}</span>`;
		} else {
			text += `<span class="df-text">${total}</span>`;
		}
		text += ` [[dice:roll-one-die-1]] ${
			escapeHTML(
				notation,
			)
		}[[dice:roll-one-die-2]]`;
		return text;
	}
	let diceString = '';
	for (const [index, diceEntry] of diceUsed.entries()) {
		if (typeof diceEntry === 'object') {
			diceString = parseRollGroup(
				rolls[index].rolls ?? rolls[index].results,
				diceEntry,
				diceString,
			);
		}
	}
	const text = `[[dice:roll-many-dice-0]] ${total} [[dice:roll-many-dice-1]] ${diceString} [[dice:roll-many-dice-2]] ${
		escapeHTML(
			notation,
		)
	}[[dice:roll-many-dice-3]]`;
	return text;
}
function parseRollGroup(rolls, diceEntry, diceString, i = 10) {
	if (typeof diceEntry !== 'object' || typeof rolls !== 'object') return;
	if (i < 0) {
		throw new Error('[[dice:too-many-nested-groups]]');
	}
	if (diceEntry instanceof RollGroup) {
		for (
			const [
				groupIndex,
				groupDiceEntry,
			] of diceEntry.expressions.entries()
		) {
			if (typeof groupDiceEntry !== 'object') continue;
			for (
				const [
					index,
					individualDiceEntry,
				] of groupDiceEntry.entries()
			) {
				if (typeof individualDiceEntry !== 'object') continue;
				diceString += parseRollGroup(
					rolls[groupIndex].results[index],
					individualDiceEntry,
					diceString,
					i - 1,
				);
			}
		}
		return diceString;
	}
	let { sides } = diceEntry;
	if (diceEntry instanceof FudgeDice) {
		sides = 'F';
	}
	if (rolls instanceof RollResults) {
		rolls = rolls.rolls;
	}
	for (const roll of rolls) {
		if (typeof roll !== 'object') continue;
		if (dice.includes(`d${sides}`)) {
			let iconValue = roll.value;
			if (diceEntry instanceof FudgeDice) {
				if (roll.value === 1) iconValue = 'plus';
				else if (roll.value === -1) iconValue = 'minus';
				else iconValue = 'zero';
			}
			diceString +=
				`<i class="df-d${sides}-${iconValue} df-event-icon"></i><span class="df-icon-text">${roll.value}</span> `;
		} else {
			diceString += `<span class="df-text">${roll.value}</span> `;
		}
	}
	return diceString;
}

async function parseCommands(post) {
	const commands = post.content.matchAll(/^\s*\/roll([^#\n]+)(#[^\n]*)?$/gim);
	let eventsData = [];
	for (let [, notation] of commands) {
		notation = notation
			.replaceAll(/\s/gm, () => '')
			.replaceAll(/\d*k\d+/gim, 'd');
		let total;
		let rolls;
		let diceUsed;
		let parsedNotation;
		try {
			({
				total,
				rolls,
				notation: parsedNotation,
			} = roller.roll(notation));
			diceUsed = Parser.parse(notation);
		} catch (e) {
			console.error(e);
			continue;
		}
		if (rolls.length === 0) {
			continue;
		}
		const text = createText(total, rolls, diceUsed, parsedNotation);
		const event = {
			type: 'dice',
			text,
			uid: post.uid,
		};
		const eventData = await events.log(post.tid, event);
		eventsData = eventsData.concat(eventData);
	}
	const uids = await getUidsFromSet('users:online', 0, -1);
	const cid = await getTopicField(post.tid, 'cid');
	const notifyUids = await filterUids('topics:read', cid, uids);
	emitToUids('plugins:dice:event:new_roll', eventsData, notifyUids);
	return post;
}

async function parseChatCommands(message) {
	const results = [];
	const commands = message.cleanedContent.matchAll(/^\s*\/roll([^#\n]+)(#[^\n]*)?$/gim);
	for (let [, notation] of commands) {
		notation = notation
			.replaceAll(/\s/gm, () => '')
			.replaceAll(/\d*k\d+/gim, 'd');
		let total;
		let rolls;
		let diceUsed;
		let parsedNotation;
		try {
			({
				total,
				rolls,
				notation: parsedNotation,
			} = roller.roll(notation));
			diceUsed = Parser.parse(notation);
		} catch (e) {
			console.error(e);
			continue;
		}
		if (rolls.length === 0) {
			continue;
		}
		const text = createText(total, rolls, diceUsed, parsedNotation);
		results.push(text.replaceAll(/<[^>]+>/gm, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
	}
	return results;
}

plugin.createPost = async function ({ post, data }) {
	post.content = post.content.replaceAll(/^\s*\/\u200B+roll/giu, () => '/roll');
	post = await parseCommands(post);
	post.content = post.content.replaceAll(/^\s*\/roll/g, () => '/\u200Broll');
	return { post, data };
};
plugin.editPost = async function ({ post, data }) {
	let postData = await getPostData(data.pid);
	postData = await parseCommands(postData);
	post.content = post.content.replaceAll(/^\s*\/roll/g, () => '/\u200Broll');
	return { post, data };
};
plugin.parsePost = async function ({ postData }) {
	if (postData.content.split('<p').length > 2) {
		postData.content = postData.content.replaceAll(
			/^(<p dir="auto">)?\/\u200B?roll(?<rollData>[^#\n]+)(?<rollComment>#[^\n]+)?(<br>|<\/p>|$)/gimu,
			(_text, _p1, rollData, rollComment) => {
				const rollCommentText = rollComment && rollComment.length > 0 && rollComment[0] === '#' ?
					`<p dir="auto">${rollComment.substr(1)}</p>` :
					'';
				return `<div class="dice-roll-hidden">/roll${rollData}</div> ${rollCommentText}`;
			},
		);
	}
	return { postData };
};

plugin.onSentMessage = async function ({ message, data }) {
	const results = await parseChatCommands(message);

	for (const result of results ?? []) {
		addSystemMessage(`dice-ignore]]${result} [[modules:chat.system.dice-for`, data.uid, data.roomId);
	}
};

module.exports = plugin;
