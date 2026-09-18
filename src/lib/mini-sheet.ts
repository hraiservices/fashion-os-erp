/**
 * Formula engine for the utility rail's mini spreadsheet. Small on purpose — cell refs (A1),
 * ranges (A1:A5) inside SUM/PRODUCT/AVERAGE/MIN/MAX, arithmetic operators, parentheses, unary
 * minus, and number literals. Not a general expression language: no strings, no comparisons, no
 * other functions.
 *
 * A cell's raw text starting with "=" is a formula; anything else is a literal (numbers render
 * right-aligned/tabular, text renders as-is). Formulas resolve other cells recursively, with a
 * visited-set to catch circular references instead of blowing the stack.
 */

export const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const ROWS = 15;

export function cellId(col: string, row: number): string {
  return `${col}${row}`;
}

/** A cell's value plus optional formatting — stored as one JSON object per non-empty cell. A
 *  legacy sheet (saved before formatting existed) has plain strings instead; normalizeCell
 *  upgrades either shape to this one so the rest of the app only ever deals with CellData. */
export interface CellData {
  value: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  bg?: string;
}

export function normalizeCell(raw: unknown): CellData {
  if (typeof raw === "string") return { value: raw };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    return {
      value: typeof r.value === "string" ? r.value : "",
      bold: r.bold === true,
      italic: r.italic === true,
      color: typeof r.color === "string" ? r.color : undefined,
      bg: typeof r.bg === "string" ? r.bg : undefined,
    };
  }
  return { value: "" };
}

export function normalizeCells(raw: Record<string, unknown> | null | undefined): Record<string, CellData> {
  const out: Record<string, CellData> = {};
  for (const [ref, v] of Object.entries(raw || {})) out[ref] = normalizeCell(v);
  return out;
}

/** Excel-style AutoSum/AutoProduct range: the contiguous run of non-empty cells directly above
 *  `ref` in the same column, stopping at the first blank. Returns null when the cell right above
 *  is itself blank (nothing sensible to sum) or `ref` is in row 1. */
export function autoRangeAbove(ref: string, cells: Record<string, CellData>): string | null {
  const m = /^([A-H])([0-9]+)$/.exec(ref);
  if (!m) return null;
  const col = m[1];
  const row = parseInt(m[2], 10);
  if (row <= 1) return null;
  if (!(cells[cellId(col, row - 1)]?.value || "").trim()) return null;
  let top = row - 1;
  while (top > 1 && (cells[cellId(col, top - 1)]?.value || "").trim()) top--;
  return `${cellId(col, top)}:${cellId(col, row - 1)}`;
}

function parseRef(ref: string): { col: string; row: number } | null {
  const m = /^([A-H])([1-9][0-9]?)$/.exec(ref.toUpperCase());
  if (!m) return null;
  const row = parseInt(m[2], 10);
  if (row < 1 || row > ROWS) return null;
  return { col: m[1], row };
}

function rangeRefs(a: string, b: string): string[] | null {
  const ra = parseRef(a);
  const rb = parseRef(b);
  if (!ra || !rb) return null;
  const colFrom = Math.min(COLS.indexOf(ra.col as (typeof COLS)[number]), COLS.indexOf(rb.col as (typeof COLS)[number]));
  const colTo = Math.max(COLS.indexOf(ra.col as (typeof COLS)[number]), COLS.indexOf(rb.col as (typeof COLS)[number]));
  const rowFrom = Math.min(ra.row, rb.row);
  const rowTo = Math.max(ra.row, rb.row);
  const refs: string[] = [];
  for (let c = colFrom; c <= colTo; c++) {
    for (let r = rowFrom; r <= rowTo; r++) refs.push(cellId(COLS[c], r));
  }
  return refs;
}

class EvalError extends Error {}

class Tokenizer {
  private pos = 0;
  constructor(private src: string) {}

  peek(): string {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++;
    return this.src[this.pos] || "";
  }

  next(): string {
    const c = this.peek();
    this.pos++;
    return c;
  }

  readWhile(re: RegExp): string {
    let out = "";
    while (this.pos < this.src.length && re.test(this.src[this.pos])) out += this.src[this.pos++];
    return out;
  }

  atEnd(): boolean {
    this.peek();
    return this.pos >= this.src.length;
  }
}

function evalFormula(expr: string, resolve: (ref: string) => number): number {
  const tok = new Tokenizer(expr);

  function parseExpr(): number {
    let value = parseTerm();
    for (;;) {
      const op = tok.peek();
      if (op === "+" || op === "-") {
        tok.next();
        const rhs = parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const op = tok.peek();
      if (op === "*" || op === "/") {
        tok.next();
        const rhs = parseFactor();
        if (op === "/") {
          if (rhs === 0) throw new EvalError("Divide by zero");
          value = value / rhs;
        } else value = value * rhs;
      } else break;
    }
    return value;
  }

  function parseFactor(): number {
    const c = tok.peek();
    if (c === "-") {
      tok.next();
      return -parseFactor();
    }
    if (c === "+") {
      tok.next();
      return parseFactor();
    }
    if (c === "(") {
      tok.next();
      const value = parseExpr();
      if (tok.next() !== ")") throw new EvalError("Missing )");
      return value;
    }
    if (/[0-9.]/.test(c)) {
      const num = tok.readWhile(/[0-9.]/);
      const value = parseFloat(num);
      if (Number.isNaN(value)) throw new EvalError("Bad number");
      return value;
    }
    if (/[A-Za-z]/.test(c)) {
      const word = tok.readWhile(/[A-Za-z]/);
      if (tok.peek() === "(") {
        tok.next();
        const args = parseRangeArgs();
        if (tok.next() !== ")") throw new EvalError("Missing )");
        return applyFunction(word.toUpperCase(), args);
      }
      const digits = tok.readWhile(/[0-9]/);
      const ref = word.toUpperCase() + digits;
      if (tok.peek() === ":") {
        tok.next();
        const word2 = tok.readWhile(/[A-Za-z]/);
        const digits2 = tok.readWhile(/[0-9]/);
        const refs = rangeRefs(ref, word2.toUpperCase() + digits2);
        if (!refs) throw new EvalError(`Bad range: ${ref}:${word2}${digits2}`);
        return refs.reduce((s, r) => s + resolve(r), 0);
      }
      if (!parseRef(ref)) throw new EvalError(`Bad ref: ${ref}`);
      return resolve(ref);
    }
    throw new EvalError(`Unexpected character: ${c || "end of formula"}`);
  }

  function parseRangeArgs(): number[] {
    // SUM/AVERAGE take one range (A1:B3) or a comma-separated list of refs/numbers.
    const first = tok.peek();
    if (/[A-Za-z]/.test(first)) {
      const savedPos = (tok as unknown as { pos: number }).pos;
      const word = tok.readWhile(/[A-Za-z]/);
      const digits = tok.readWhile(/[0-9]/);
      if (tok.peek() === ":") {
        tok.next();
        const word2 = tok.readWhile(/[A-Za-z]/);
        const digits2 = tok.readWhile(/[0-9]/);
        const refs = rangeRefs(word.toUpperCase() + digits, word2.toUpperCase() + digits2);
        if (!refs) throw new EvalError("Bad range");
        return refs.map(resolve);
      }
      (tok as unknown as { pos: number }).pos = savedPos;
    }
    const values: number[] = [];
    if (tok.peek() === ")") return values;
    values.push(parseExpr());
    while (tok.peek() === ",") {
      tok.next();
      values.push(parseExpr());
    }
    return values;
  }

  function applyFunction(name: string, args: number[]): number {
    if (name === "SUM") return args.reduce((s, v) => s + v, 0);
    if (name === "PRODUCT") return args.length ? args.reduce((s, v) => s * v, 1) : 0;
    if (name === "AVERAGE") return args.length ? args.reduce((s, v) => s + v, 0) / args.length : 0;
    if (name === "MIN") return args.length ? Math.min(...args) : 0;
    if (name === "MAX") return args.length ? Math.max(...args) : 0;
    throw new EvalError(`Unknown function: ${name}`);
  }

  if (tok.atEnd()) throw new EvalError("Empty formula");
  const result = parseExpr();
  if (!tok.atEnd()) throw new EvalError("Unexpected trailing input");
  return result;
}

/** Evaluates every cell once, returning display strings. Non-formula cells pass through as-is
 *  (numeric-looking text is still just text — only "=" cells actually compute). Circular
 *  references and parse/eval errors both render as a short "#…" marker rather than throwing. */
export function evalSheet(cells: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const inProgress = new Set<string>();

  function resolve(ref: string): number {
    if (inProgress.has(ref)) throw new EvalError("Circular reference");
    const value = out[ref] !== undefined ? out[ref] : (compute(ref), out[ref]);
    if (value.startsWith("#")) throw new EvalError("Upstream error");
    const n = parseFloat(value);
    return Number.isNaN(n) ? 0 : n;
  }

  function compute(ref: string): number {
    const raw = cells[ref];
    if (!raw || !raw.trim()) {
      out[ref] = "";
      return 0;
    }
    if (!raw.trim().startsWith("=")) {
      out[ref] = raw;
      const n = parseFloat(raw);
      return Number.isNaN(n) ? 0 : n;
    }
    inProgress.add(ref);
    try {
      const value = evalFormula(raw.trim().slice(1), resolve);
      const rounded = Math.round(value * 1e6) / 1e6;
      out[ref] = String(rounded);
      return rounded;
    } catch (e) {
      out[ref] = e instanceof EvalError ? `#${e.message.includes("Circular") ? "CIRC" : "ERR"}` : "#ERR";
      return 0;
    } finally {
      inProgress.delete(ref);
    }
  }

  for (const ref of Object.keys(cells)) {
    if (out[ref] === undefined) compute(ref);
  }
  return out;
}
