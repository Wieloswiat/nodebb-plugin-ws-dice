"use strict";

const { escapeHTML } = require.main.require("./src/utils");
const { events } = require.main.require("./src/topics");
const { getPostData } = require.main.require("./src/posts");

const { parseDiceNotation } = require("./lib/dice-parser");
const plugin = {};

const dice = ["d2", "d4", "d6", "d8", "d10", "d12", "d20", "dF"];

plugin.addTopicEvents = async function ({ types }) {
    types.dice = {
        icon: "fa-dice",
    };
    return { types };
};
function createText(result, diceResults, notation) {
    let diceString = "";
    for (const result of diceResults) {
        for (const value of result.results) {
            if (dice.includes(result.type)) {
                if (result.type === "dF") {
                    diceString += `<i class="df-${result.type}-${
                        value > 0 ? "plus" : value < 0 ? "minus" : "zero"
                    } df-event-icon"></i><span class="df-icon-text">${value}</span> `;
                    continue;
                }
                diceString += `<i class="df-${result.type}-${value} df-event-icon"></i><span class="df-icon-text">${value}</span> `;
            } else {
                diceString += `<span class="$df-text">${value}</span> `;
            }
        }
    }
    const text = `[[dice:roll-many-dice-0]] ${result} [[dice:roll-many-dice-1]] ${diceString} [[dice:roll-many-dice-2]] ${escapeHTML(
        notation
    )} [[dice:roll-many-dice-3]]`;
    return text;
}

async function parseCommands(post) {
    const commands = post.content.matchAll(
        /^\s*\/roll([dk\s\d+\-/*\(\)<>^×x÷F]+)(#.*)?$/gim
    );
    for (const [, notation] of commands) {
        const { result, diceResults } = parseDiceNotation(notation);
        if (diceResults.length === 0) {
            continue;
        }
        let text = createText(result, diceResults, notation);
        if (
            diceResults.length === 1 &&
            diceResults[0].results.length === 1 &&
            diceResults[0].results[0] === result
        ) {
            if (dice.includes(diceResults[0].type)) {
                text = `[[dice:roll-one-die-0]] <i class="df-${
                    diceResults[0].type
                }-${
                    diceResults[0].results[0]
                } df-event-icon"></i><span class="df-icon-text">${
                    diceResults[0].results[0]
                }</span> [[dice:roll-one-die-1]] ${escapeHTML(
                    notation
                )} [[dice:roll-one-die-2]]`;
            } else {
                text = `[[dice:roll-one-die-0]] <span class="df-text">${
                    diceResults[0].results[0]
                }</span> [[dice:roll-one-die-1]] ${escapeHTML(
                    notation
                )} [[dice:roll-one-die-2]]`;
            }
        }

        const event = {
            type: "dice",
            text,
            uid: post.uid,
        };
        await events.log(post.tid, event);
    }
    return post;
}

plugin.createPost = async function ({ post, data }) {
    post.content = post.content.replace(/^\s*\/\u200B+roll/giu, () => "/roll");
    post = await parseCommands(post);
    post.content = post.content.replace(/^\s*\/roll/g, () => "/\u200Broll");
    return { post, data };
};
plugin.editPost = async function ({ post, data }) {
    const postData = await getPostData(data.pid);
    postData = await parseCommands(postData);
    post.content = post.content.replace(/^\s*\/roll/g, () => "/\u200Broll");
    return { post, data };
};
plugin.parsePost = async function ({ postData }) {
    postData.content = postData.content.replace(
        /^(<p dir="auto">)?\/\u200B?roll(?<rollData>[^#\n]+)(?<rollComment>#[^\n]+)?(<\/p>)$/gimu,
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

module.exports = plugin;
