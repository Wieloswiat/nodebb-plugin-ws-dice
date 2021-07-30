const { ExpressionParser } = require("expressionparser");
const { randomInt } = require("crypto");

function resolveSymbol(symbol, func) {
    while (typeof symbol === "function" || symbol instanceof Function) {
        symbol = symbol();
    }
    if (symbol instanceof Array) {
        return func(symbol);
    }
    return symbol;
}

function divide(a, b) {
    a = resolveSymbol(a, (x) => x.reduce((a, b) => a + b, 0));
    b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
    return a / b;
}
function multiply(a, b) {
    a = resolveSymbol(a, (x) => x.reduce((a, b) => a + b, 0));
    b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
    return a * b;
}

/**
 * @typedef {import("expressionparser/dist/ExpressionParser").ExpressionParserOptions} diceLanguage
 */
const diceLanguage = {
    // The dice expression language.
    AMBIGUOUS: {
        "-": "NEG",
    },
    INFIX_OPS: {
        "+": function (a, b) {
            a = resolveSymbol(a, (x) => x.reduce((a, b) => a + b, 0));
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            return a + b;
        },
        "-": function (a, b) {
            a = resolveSymbol(a, (x) => x);
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            if (b === "L" || b === "N") {
                return a.sort().slice(1);
            } else if (b === "H" || b === "W") {
                return a.sort().reverse().slice(1);
            }
            if (a instanceof Array) {
                a = a.reduce((a, b) => a + b, 0);
            }
            return a - b;
        },
        "*": multiply,
        "×": multiply,
        x: multiply,
        "/": divide,
        "÷": divide,
        "<": function (a, b) {
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            if (!(a instanceof Number)) {
                return resolveSymbol(a, (x) => x.filter((x) => x < b)).lenght;
            }
            return a < b;
        },
        ">": function (a, b) {
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            if (!(a instanceof Number)) {
                return resolveSymbol(a, (x) => x.filter((x) => x > b)).lenght;
            }
            return a > b;
        },
        "^": function (a, b) {
            a = resolveSymbol(a, (x) => x.reduce((a, b) => a + b, 0));
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            return Math.pow(a, b);
        },
    },
    PREFIX_OPS: {
        SQRT: function (expr) {
            return Math.sqrt(expr);
        },
        NEG: function (expr) {
            return -expr;
        },
    },
    PRECEDENCE: [
        ["<", ">"],
        ["SQRT", "^"],
        ["*", "/", "×", "x", "÷"],
        ["+", "-"],
    ],
    GROUP_OPEN: "(",
    GROUP_CLOSE: ")",
    SEPARATOR: " ",
    SYMBOLS: ["(", ")", "+", "-", "*", "/", "×", "÷", "<", ">", "^", "SQRT"],
    termTyper: function (term) {
        if (term.match(/^\d*[dk](\d+|F)/i)) {
            return "array";
        }
        return "number";
    },
    termDelegate: function (term) {
        if (term.match(/^\d*[dk](\d+|F)/i)) {
            let { numDice, numSides } = term.match(
                /(?<numDice>\d*)[dk](?<numSides>\d+|F)/i
            ).groups;
            if (numDice && !isNaN(parseInt(numDice, 10))) {
                numDice = Math.max(parseInt(numDice, 10), 1);
            } else {
                numDice = 1;
            }
            const results = [];
            const start = numSides.toUpperCase() === "F" ? -1 : 1;
            const end =
                numSides.toUpperCase() === "F" ? 2 : parseInt(numSides, 10) + 1;
            for (let i = 0; i < numDice; i++) {
                results.push(randomInt(start, end));
            }
            const diceResults = {
                type: `d${numSides}`,
                results,
            };
            this.diceResults
                ? this.diceResults.push(diceResults)
                : (this.diceResults = [diceResults]);
            return results;
        }
        return parseInt(term);
    },
    isCaseInsensitive: true,
};

/**
 * @param {string} notation
 * @returns { result: number, diceResults: Array<{type: string, results: Array<number>}> } results
 */
function parseDiceNotation(notation) {
    const parser = new ExpressionParser(diceLanguage);
    let result = parser.expressionToValue(notation);
    const diceResults = this.diceResults;
    this.diceResults = null;
    if (!(result instanceof Number)) {
        result = resolveSymbol(result, (x) => x.reduce((a, b) => a + b, 0));
    }
    return { result, diceResults: diceResults };
}
module.exports = { parseDiceNotation };
