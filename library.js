'use strict';

const {
	DiceRoller,
	NumberGenerator,
	Parser,
} = require('@dice-roller/rpg-dice-roller');


const nconf = nodebb.require('nconf');
const { events, getTopicField } = nodebb.require('./src/topics');
const { getPostData } = nodebb.require('./src/posts');

const { emitToUids } = nodebb.require('./src/socket.io/helpers');
const { getUidsFromSet } = nodebb.require('./src/user');
const { filterUids } = nodebb.require('./src/privileges/categories');
const helpers = nodebb.require('./src/helpers');
const utils = nodebb.require('./src/utils');
const tx = nodebb.require('./src/translator');
const messaging = nodebb.require('./src/messaging');
const user = nodebb.require('./src/user');

const relative_path = nconf.get('relative_path');

const escapeCharMap = Object.freeze({
	'&': '&#38;',
	'<': '&#60;',
	'>': '&#62;',
	'"': '&#34;',
	"'": '&#39;',
	'=': '&#61;',
});

const chatMap = Object.freeze({
	'&#38;': '＆',
	'&#60;': '＜',
	'&#62;': '＞',
	'&#34;': '＂',
	'&#39;': '＇',
	'&#61;': '＝',
});

const escapeChars = /[&<>"'=]/g;

const escapeChatChars = /(&#38;|&#60;|&#62;|&#34;|&#39;|&#61;)/g;

const escapeHTML = (str) => {
	if (str == null) {
		return '';
	}
	if (!str) {
		return String(str);
	}
	return str.toString().replace(escapeChars, char => escapeCharMap[char]);
};

const escapeChat = (str) => {
	if (str == null) {
		return '';
	}
	if (!str) {
		return String(str);
	}
	return str.toString().replace(escapeChatChars, char => chatMap[char]);
};

const plugin = {};

const dice = ['d2', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'dF'];

const roller = new DiceRoller();

const { generator } = NumberGenerator;
generator.engines = NumberGenerator.engines.nodeCrypto;

plugin.addTopicEvents = async function ({ types }) {
	types.dice = {
		icon: 'fa-dice',
		translation: translateDiceEvent,
	};
	return { types };
};

function renderUser(user) {
	return `${helpers.buildAvatar(user, '16px', true)} <a href="${relative_path}/user/${user.userslug}">${user.username}</a>`;
}

function renderTimeago(timestamp) {
	return `<span class="timeago timeline-text" title="${timestamp}"></span>`;
}

async function translateDiceEvent(event, language) {
	const diceText = event.text === undefined ?
		createText(event.total, JSON.parse(event.rolls), JSON.parse(event.diceUsed), event.parsedNotation) :
		event.text;
	const text = `${diceText} ${renderUser(event.user)} ${renderTimeago(event.timestampISO)}`;
	return utils.decodeHTMLEntities(await tx.translate(text, language));
}

function createText(total, rolls, diceUsed, notation) {
	if (rolls.length === 1 && diceUsed[0].qty === 1) {
		let text = '[[dice:roll-one-die-0]] ';
		let { sides } = diceUsed[0];
		let iconValue = total;
		if (diceUsed[0].name === 'fudge') {
			sides = 'F';
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
	const text = `[[dice:roll-many-dice-0]] ${total} [[dice:roll-many-dice-1]] ${diceString}[[dice:roll-many-dice-2]] ${
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
	if (diceEntry.isRollGroup) {
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
	if (diceEntry.name === 'fudge') {
		sides = 'F';
	}
	if (rolls.rolls !== undefined) {
		rolls = rolls.rolls;
	}
	for (const roll of rolls) {
		if (typeof roll !== 'object') continue;
		if (dice.includes(`d${sides}`)) {
			let iconValue = roll.value;
			if (diceEntry.name === 'fudge') {
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
	const commands = post.content.matchAll(/^\s*\/roll([^#\n]+)(#[^\n]*)?$/gimu);
	let eventsData = [];
	for (let [, notation] of commands) {
		notation = notation
			.replaceAll(/\s/gmu, () => '')
			.replaceAll(/\d*k\d+/gimu, 'd');
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
		const event = {
			type: 'dice',
			total,
			rolls: JSON.stringify(rolls),
			diceUsed: JSON.stringify(diceUsed),
			parsedNotation,
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
	const commands = message.content.matchAll(/^\s*\/roll([^#\n]+)(#[^\n]*)?$/gim);
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
		results.push(escapeChat(text.replaceAll(/<[^>]+>/gm, '')).trim());
	}
	return results;
}

plugin.createPost = async function ({ post, data }) {
	post.content = post.content.replaceAll(/^\s*\/\u200B+roll/gimu, () => '/roll');
	post = await parseCommands(post);
	post.content = post.content.replaceAll(/^\s*\/roll/gimu, () => '/\u200Broll');
	return { post, data };
};
plugin.editPost = async function ({ post, data }) {
	let postData = await getPostData(data.pid);
	postData.content = post.content;
	postData = await parseCommands(postData);
	post.content = postData.content.replaceAll(/^\s*\/roll/gimu, () => '/\u200Broll');
	return { post, data };
};
plugin.parsePost = async function ({ postData }) {
	if (
		!postData.content.split('<p').every(
			p => !p.length || p.match(/^\s*(dir="auto")?>?\/\u200B?roll(?<rollData>[^#\n]+)?(<br>|<\/p>|$)/gimu),
		)
	) {
		postData.content = postData.content.replaceAll(
			/^(<p dir="auto">)?\/\u200B?roll(?<rollData>[^#\n]+)(?<rollComment>#[^\n]+)?(<br>|<\/p>|$)/gimu,
			(_text, _p1, rollData, rollComment) => {
				const rollCommentText = rollComment && rollComment.length > 0 && rollComment[0] === '#' ?
					`<p dir="auto">${rollComment.substr(1)}</p>` :
					'';
				return `<span class="dice-roll-hidden">/roll${rollData}</span> ${rollCommentText}`;
			},
		);
	}
	return { postData };
};

plugin.onSentMessage = async function ({ message, data }) {
	if (!message.content) {
		return;
	}
	const results = await parseChatCommands(message);

	for (const result of results ?? []) {
		// not using core addSystemMessage because it doesn't allow for custom content
		const displayname = await user.getNotificationDisplayname(data.uid);
		const message = await messaging.addMessage({
			type: 'dice-roll',
			// core runs tx.translate on content if system is set to 1
			content: `${result} ${displayname}`,
			uid: data.uid,
			roomId: data.roomId,
			system: 1,
			timestamp: Date.now(),
		});
		messaging.notifyUsersInRoom(data.uid, data.roomId, message);
	}
};

module.exports = plugin;
