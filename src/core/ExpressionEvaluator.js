// =============================================================================
// FILE: src/core/ExpressionEvaluator.js
// =============================================================================

/**
 * ExpressionEvaluator — src/core/ExpressionEvaluator.js
 *
 * Evaluates expressions with comparison, logical, ternary, and arithmetic operators
 * inside a {{...}}.
 *
 * SECURITY DESIGN (rewritten): unlike the previous version, this implementation
 * NEVER executes the expression as real JavaScript -- there is no Function() or
 * eval() anywhere in the code. Instead, it tokenizes the expression against an
 * explicit and closed grammar (numbers, strings, dot-path identifiers, and a fixed
 * set of comparison/logical/arithmetic/ternary operators) and evaluates the
 * resulting tree manually in standard JS.
 *
 * This fundamentally eliminates the entire family of prototype-chain escapes
 * (constructor.constructor(...), __proto__, etc.) and bracket/backtick notation
 * escapes -- not as individually blocked edge cases, but because the grammar lacks
 * runtime property access or function invocation rules. The dot (".") is only
 * recognized as part of an identifier TOKEN (a text path resolved once against the
 * DataStore), never as an operator applied to an evaluated value, and no invocation
 * rule exists. There is no valid token sequence in this grammar that allows calling
 * anything or reaching a real environment object (Function, window, process, etc.):
 * there is simply no syntax for that, even if dataStore.get() were ever to return
 * a live reference.
 *
 * Any character not part of the grammar (whitelist, not blacklist) causes
 * tokenization to fail, and evaluate() returns false.
 */
export class ExpressionEvaluator {
  static #reservedWords = new Map([
    ["true", true],
    ["false", false],
    ["null", null],
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ]);

  static #THREE_CHAR_OPS = ["===", "!=="];
  static #TWO_CHAR_OPS = ["==", "!=", "<=", ">=", "&&", "||"];
  static #ONE_CHAR_OPS = ["<", ">", "!", "+", "-", "*", "/", "?", ":", "(", ")"];

  // ---------------------------------------------------------------------
  // Tokenizer — explicit whitelist. Any character not covered here
  // (includes [, ], `, {, }, ;, ,, =, %, ^, loose & or |, ~, @, etc.)
  // fails tokenization with an exception, caught in evaluate().
  // ---------------------------------------------------------------------
  static #tokenize(str) {
    const tokens = [];
    let i = 0;

    while (i < str.length) {
      const ch = str[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      if (ch === "'" || ch === '"') {
        const quote = ch;
        let j = i + 1;
        let value = "";
        while (j < str.length && str[j] !== quote) {
          value += str[j];
          j++;
        }
        if (str[j] !== quote) throw new Error("unterminated string");
        tokens.push({ type: "STRING", value });
        i = j + 1;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < str.length && /[0-9.]/.test(str[j])) j++;
        tokens.push({ type: "NUMBER", value: Number(str.slice(i, j)) });
        i = j;
        continue;
      }

      if (/[a-zA-Z_$]/.test(ch)) {
        let j = i;
        while (
          j < str.length &&
          (/[a-zA-Z0-9_$]/.test(str[j]) ||
            (str[j] === "." && /[a-zA-Z_$]/.test(str[j + 1] || "")))
        ) {
          j++;
        }
        const word = str.slice(i, j);
        if (ExpressionEvaluator.#reservedWords.has(word)) {
          tokens.push({ type: "LITERAL", value: ExpressionEvaluator.#reservedWords.get(word) });
        } else {
          tokens.push({ type: "PATH", value: word });
        }
        i = j;
        continue;
      }

      const three = str.slice(i, i + 3);
      if (ExpressionEvaluator.#THREE_CHAR_OPS.includes(three)) {
        tokens.push({ type: "OP", value: three });
        i += 3;
        continue;
      }

      const two = str.slice(i, i + 2);
      if (ExpressionEvaluator.#TWO_CHAR_OPS.includes(two)) {
        tokens.push({ type: "OP", value: two });
        i += 2;
        continue;
      }

      if (ExpressionEvaluator.#ONE_CHAR_OPS.includes(ch)) {
        tokens.push({ type: "OP", value: ch });
        i++;
        continue;
      }

      throw new Error(`disallowed character: ${ch}`);
    }

    return tokens;
  }

  // ---------------------------------------------------------------------
  // Recursive-descent parser + direct evaluation (does not build a separate
  // AST: evaluates as it descends). Precedence from lowest to highest:
  // ternary, ||, &&, equality, relational, additive, multiplicative,
  // unary, primary. No "call" or "property access on value" rules exist --
  // by design, not by blocking.
  // ---------------------------------------------------------------------
  static #parse(tokens, dataStore) {
    let pos = 0;

    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const isOp = (val) => peek() && peek().type === "OP" && peek().value === val;
    const expectOp = (value) => {
      const tok = next();
      if (!tok || tok.type !== "OP" || tok.value !== value) {
        throw new Error(`expected "${value}"`);
      }
    };

    function parseTernary() {
      const cond = parseLogicalOr();
      if (isOp("?")) {
        next();
        const whenTrue = parseTernary();
        expectOp(":");
        const whenFalse = parseTernary();
        return cond ? whenTrue : whenFalse;
      }
      return cond;
    }

    function parseLogicalOr() {
      let left = parseLogicalAnd();
      while (isOp("||")) {
        next();
        // NOTE: always parse the right side (parseLogicalAnd), even if JS ||
        // would short-circuit -- otherwise, when `left` is already truthy,
        // the right side is not consumed as tokens and is left as "leftovers"
        // at the end, breaking parsing even if the value was correct. The
        // evaluation itself effectively short-circuits (we use JS || over the
        // two resolved values), only parsing cannot be skipped.
        const right = parseLogicalAnd();
        left = left || right;
      }
      return left;
    }

    function parseLogicalAnd() {
      let left = parseEquality();
      while (isOp("&&")) {
        next();
        const right = parseEquality();
        left = left && right;
      }
      return left;
    }

    function parseEquality() {
      let left = parseRelational();
      while (peek() && peek().type === "OP" && ["==", "!=", "===", "!=="].includes(peek().value)) {
        const op = next().value;
        const right = parseRelational();
        if (op === "==") left = left == right;
        else if (op === "!=") left = left != right;
        else if (op === "===") left = left === right;
        else left = left !== right;
      }
      return left;
    }

    function parseRelational() {
      let left = parseAdditive();
      while (peek() && peek().type === "OP" && ["<", ">", "<=", ">="].includes(peek().value)) {
        const op = next().value;
        const right = parseAdditive();
        if (op === "<") left = left < right;
        else if (op === ">") left = left > right;
        else if (op === "<=") left = left <= right;
        else left = left >= right;
      }
      return left;
    }

    function parseAdditive() {
      let left = parseMultiplicative();
      while (isOp("+") || isOp("-")) {
        const op = next().value;
        const right = parseMultiplicative();
        left = op === "+" ? left + right : left - right;
      }
      return left;
    }

    function parseMultiplicative() {
      let left = parseUnary();
      while (isOp("*") || isOp("/")) {
        const op = next().value;
        const right = parseUnary();
        left = op === "*" ? left * right : left / right;
      }
      return left;
    }

    function parseUnary() {
      if (isOp("!") || isOp("-")) {
        const op = next().value;
        const operand = parseUnary();
        return op === "!" ? !operand : -operand;
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const tok = next();
      if (!tok) throw new Error("incomplete expression");

      if (tok.type === "NUMBER" || tok.type === "STRING" || tok.type === "LITERAL") {
        return tok.value;
      }

      if (tok.type === "PATH") {
        const val = dataStore.get(tok.value);
        return val !== undefined ? val : null;
      }

      if (tok.type === "OP" && tok.value === "(") {
        const inner = parseTernary();
        expectOp(")");
        return inner;
      }

      throw new Error("unexpected token");
    }

    const result = parseTernary();
    if (pos !== tokens.length) throw new Error("trailing tokens at the end of the expression");
    return result;
  }

  static evaluate(expr, dataStore) {
    if (typeof expr !== "string") return expr;
    const trimmed = expr.trim();
    if (!trimmed) return false;

    try {
      const tokens = ExpressionEvaluator.#tokenize(trimmed);
      if (tokens.length === 0) return false;
      return ExpressionEvaluator.#parse(tokens, dataStore);
    } catch {
      return false;
    }
  }
}
