const { ExpressionParser } = require("expressionparser");
const { randomInt } = require("crypto");

function resolveSymbol(symbol, func = (x) => x) {
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
            a = resolveSymbol(a);
            b = resolveSymbol(b);
            if (a instanceof Array && b instanceof Array) {
                return a.concat(b);
            }
            a = a instanceof Array ? a.reduce((x, y) => x + y, 0) : a;
            b = b instanceof Array ? b.reduce((x, y) => x + y, 0) : b;
            return a + b;
        },
        "-": function (a, b) {
            a = resolveSymbol(a);
            b = resolveSymbol(b);
            if (a instanceof Array && b instanceof Array) {
                return a.concat(b.map((x) => -x));
            }
            a = a instanceof Array ? a.reduce((x, y) => x + y, 0) : a;
            b = b instanceof Array ? b.reduce((x, y) => x + y, 0) : b;
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
                return resolveSymbol(a, (x) => x.filter((x) => x < b)).length;
            }
            return a < b;
        },
        ">": function (a, b) {
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            if (!(a instanceof Number)) {
                return resolveSymbol(a, (x) => x.filter((x) => x > b)).length;
            }
            return a > b;
        },
        "^": function (a, b) {
            a = resolveSymbol(a, (x) => x.reduce((a, b) => a + b, 0));
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            return Math.pow(a, b);
        },
        "%": function (a, b) {
            a = resolveSymbol(a, (x) => x.reduce((a, b) => a + b, 0));
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            return a % b;
        },
        L: function (a, b) {
            a = resolveSymbol(a, (x) => x);
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            if (!(a instanceof Array)) {
                return a;
            }
            return a.sort().slice(b);
        },
        H: function (a, b) {
            a = resolveSymbol(a, (x) => x);
            b = resolveSymbol(b, (x) => x.reduce((a, b) => a + b, 0));
            if (!(a instanceof Array)) {
                return a;
            }
            return a.sort().reverse().slice(b);
        },
    },
    PREFIX_OPS: {
        SQRT: function (expr) {
            expr = resolveSymbol(expr, (x) => x.reduce((a, b) => a + b, 0));
            return Math.sqrt(expr);
        },
        NEG: function (expr) {
            expr = resolveSymbol(expr, x);
            if (expr instanceof Array) {
                return expr.map((x) => -x);
            }
            return -expr;
        },
    },
    PRECEDENCE: [
        ["L", "H"],
        ["<", ">"],
        ["SQRT", "^"],
        ["*", "/", "×", "x", "÷", "%"],
        ["+", "-"],
    ],
    GROUP_OPEN: "(",
    GROUP_CLOSE: ")",
    SEPARATOR: " ",
    SYMBOLS: [
        "(",
        ")",
        "+",
        "-",
        "*",
        "/",
        "×",
        "÷",
        "<",
        ">",
        "^",
        "SQRT",
        "H",
        "L",
        "%",
    ],
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
        if (["L", "N", "H", "W"].includes(term)) {
            return term;
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
    notation = notation.replace(
        /-(H|L)(\d+)?/gim,
        (_text, p1, p2) => p1 + (p2 ?? "1")
    );
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
