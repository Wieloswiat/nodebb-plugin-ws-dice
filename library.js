"use strict";

const { escapeHTML } = require.main.require("./src/utils");
const { events } = require.main.require("./src/topics");
const { getPostData } = require.main.require("./src/posts");
const { addSystemMessage } = require.main.require("./src/messaging");
const winston = require.main.require('winston');
const {
    DiceRoller,
    NumberGenerator,
    Parser,
    RollGroup,
    Results: { RollResults },
    Dice: { FudgeDice },
} = require("@dice-roller/rpg-dice-roller");
const plugin = {};

const dice = ["d2", "d4", "d6", "d8", "d10", "d12", "d20", "dF"];

const roller = new DiceRoller();

const generator = NumberGenerator.generator;
generator.engines = NumberGenerator.engines.nodeCrypto;

plugin.addTopicEvents = async function ({ types }) {
    types.dice = {
        icon: "fa-dice",
    };
    return { types };
};

function createText(total, rolls, diceUsed, notation) {
    let text = "";
    if (rolls.length === 1 && diceUsed[0].qty === 1) {
        text = "[[dice:roll-one-die-0]] ";
        let sides = diceUsed[0].sides;
        let iconValue = total;
        if (diceUsed[0] instanceof FudgeDice) {
            sides = "F";
            iconValue = total === 1 ? "plus" : total === -1 ? "minus" : "zero";
        }
        if (dice.includes(`d${sides}`)) {
            text += `<i class="df-d${sides}-${iconValue} df-event-icon"></i><span class="df-icon-text">${total}</span>`;
        } else {
            text += `<span class="df-text">${total}</span>`;
        }
        text += ` [[dice:roll-one-die-1]] ${escapeHTML(
            notation
        )} [[dice:roll-one-die-2]]`;
        return text;
    }
    let diceString = "";
    for (const [index, diceEntry] of diceUsed.entries()) {
        if (typeof diceEntry === "object") {
            diceString = parseRollGroup(
                rolls[index].rolls ?? rolls[index].results,
                diceEntry,
                diceString
            );
        }
    }
    text = `[[dice:roll-many-dice-0]] ${total} [[dice:roll-many-dice-1]] ${diceString} [[dice:roll-many-dice-2]] ${escapeHTML(
        notation
    )} [[dice:roll-many-dice-3]]`;
    return text;
}
function parseRollGroup(rolls, diceEntry, diceString, i = 10) {
    if (typeof diceEntry !== "object" || typeof rolls !== "object") return;
    if (i < 0) {
        throw new Error("[[dice:too-many-nested-groups]]");
    }
    if (diceEntry instanceof RollGroup) {
        for (const [
            groupIndex,
            groupDiceEntry,
        ] of diceEntry.expressions.entries()) {
            if (typeof groupDiceEntry !== "object") continue;
            for (const [
                index,
                individualDiceEntry,
            ] of groupDiceEntry.entries()) {
                if (typeof individualDiceEntry !== "object") continue;
                diceString += parseRollGroup(
                    rolls[groupIndex].results[index],
                    individualDiceEntry,
                    diceString,
                    i - 1
                );
            }
        }
        return diceString;
    }
    let sides = diceEntry.sides;
    if (diceEntry instanceof FudgeDice) {
        sides = "F";
    }
    if (rolls instanceof RollResults) {
        rolls = rolls.rolls;
    }
    for (const roll of rolls) {
        if (typeof roll != "object") continue;
        if (dice.includes(`d${sides}`)) {
            let iconValue = roll.value;
            if (diceEntry instanceof FudgeDice) {
                iconValue =
                    roll.value === 1
                        ? "plus"
                        : roll.value === -1
                        ? "minus"
                        : "zero";
            }
            diceString += `<i class="df-d${sides}-${iconValue} df-event-icon"></i><span class="df-icon-text">${roll.value}</span> `;
        } else {
            diceString += `<span class="df-text">${roll.value}</span> `;
        }
    }
    return diceString;
}

async function parseCommands(post) {
    let commands = post.content.matchAll(/^\s*\/roll([^#]+)(#.*)?$/gim);
    for (let [, notation] of commands) {
        notation = notation
            .replace(/\s/gm, () => "")
            .replace(/\d*k\d+/gim, "d");
        let total, rolls, diceUsed, parsedNotation;
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
            type: "dice",
            text,
            uid: post.uid,
        };
        await events.log(post.tid, event);
    }
    return post;
}

async function parseChatCommands(message) {
    const results = [];
    let commands = message.cleanedContent.matchAll(/^\s*\/roll([^#]+)(#.*)?$/gim);
    for (let [, notation] of commands) {
        notation = notation
            .replace(/\s/gm, () => "")
            .replace(/\d*k\d+/gim, "d");
        let total, rolls, diceUsed, parsedNotation;
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
        results.push(text.replace(/<[^>]+>/gm, ''));
    }
    return results;
}


plugin.createPost = async function ({ post, data }) {
    post.content = post.content.replace(/^\s*\/\u200B+roll/giu, () => "/roll");
    post = await parseCommands(post);
    post.content = post.content.replace(/^\s*\/roll/g, () => "/\u200Broll");
    return { post, data };
};
plugin.editPost = async function ({ post, data }) {
    let postData = await getPostData(data.pid);
    postData = await parseCommands(postData);
    post.content = post.content.replace(/^\s*\/roll/g, () => "/\u200Broll");
    return { post, data };
};
plugin.parsePost = async function ({ postData }) {
    postData.content = postData.content.replace(
        /^(<p dir="auto">)?\/\u200B?roll(?<rollData>[^#\n]+)(?<rollComment>#[^\n]+)?(<br>|<\/p>|$)/gimu,
        (_text, _p1, rollData, rollComment) => {
            return `<div class="dice-roll-hidden">/roll${rollData}</div>
            ${
                rollComment && rollComment.length > 0 && rollComment[0] === "#"
                    ? '<p dir="auto">' + rollComment.substr(1) + "</p>"
                    : ""
            }`;
        }
    );
    return { postData };
};

plugin.onSentMessage = async function ({ message, data }) {
    let results = await parseChatCommands(message);
    
    for (const result of results ?? []) {
        addSystemMessage(`dice-ignore]]${result} [[modules:chat.system.dice-for`, data.uid, data.roomId);
    }
}

module.exports = plugin;
