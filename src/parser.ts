import type { ParseResult, ScheduleRecord } from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_FIELDS = ['id', 'due', 'ivl', 'ease', 'reps', 'lapses'] as const;

function fail(line: number, raw: string, message: string): ParseResult {
  return { ok: false, line, issue: { line, raw, message } };
}

function isRealCalendarDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Parses one schedline record. A record is a single line of tab-separated
 * key=value fields, in any order:
 *
 *   id=react-hooks	due=2026-09-20	ivl=6	ease=2.5	reps=3	lapses=0
 */
export function parseLine(raw: string, line: number): ParseResult {
  const fields = new Map<string, string>();
  for (const part of raw.split('\t')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      return fail(line, raw, `field "${part}" is missing "="`);
    }
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (fields.has(key)) {
      return fail(line, raw, `duplicate field "${key}"`);
    }
    fields.set(key, value);
  }

  for (const key of REQUIRED_FIELDS) {
    if (!fields.has(key)) {
      return fail(line, raw, `missing required field "${key}"`);
    }
  }
  for (const key of fields.keys()) {
    if (!(REQUIRED_FIELDS as readonly string[]).includes(key)) {
      return fail(line, raw, `unknown field "${key}"`);
    }
  }

  const id = fields.get('id')!;
  if (id.length === 0 || /\s/.test(id)) {
    return fail(line, raw, 'field "id" must be non-empty and contain no whitespace');
  }

  const due = fields.get('due')!;
  if (!DATE_RE.test(due) || !isRealCalendarDate(due)) {
    return fail(line, raw, `field "due" is not a valid YYYY-MM-DD date: "${due}"`);
  }

  const ivl = Number(fields.get('ivl'));
  if (!Number.isInteger(ivl) || ivl < 0) {
    return fail(line, raw, `field "ivl" must be a non-negative integer`);
  }

  const ease = Number(fields.get('ease'));
  if (!Number.isFinite(ease) || ease < 1.3) {
    return fail(line, raw, `field "ease" must be a number >= 1.3`);
  }

  const reps = Number(fields.get('reps'));
  if (!Number.isInteger(reps) || reps < 0) {
    return fail(line, raw, `field "reps" must be a non-negative integer`);
  }

  const lapses = Number(fields.get('lapses'));
  if (!Number.isInteger(lapses) || lapses < 0) {
    return fail(line, raw, `field "lapses" must be a non-negative integer`);
  }

  const record: ScheduleRecord = { id, due, ivl, ease, reps, lapses };
  return { ok: true, line, record };
}

/**
 * Parses a schedline document from any async source of string or Buffer
 * chunks (a file stream, a socket, a fetch body reader wrapped as an async
 * iterable, and so on).
 *
 * Only the text since the last newline is ever held in memory: each chunk
 * is appended to a small carry buffer, complete lines are sliced off and
 * yielded immediately, and the carry is trimmed accordingly. A multi
 * gigabyte input is parsed in the same peak memory as a ten line one, as
 * long as no single line is itself unreasonably large.
 */
export async function* parseStream(
  input: AsyncIterable<string | Buffer>
): AsyncGenerator<ParseResult> {
  let carry = '';
  let lineNumber = 0;

  for await (const chunk of input) {
    carry += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

    let newlineAt: number;
    while ((newlineAt = carry.indexOf('\n')) !== -1) {
      const rawLine = carry.slice(0, newlineAt);
      carry = carry.slice(newlineAt + 1);
      lineNumber++;
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line.trim().length === 0) continue;
      yield parseLine(line, lineNumber);
    }
  }

  if (carry.trim().length > 0) {
    lineNumber++;
    const line = carry.endsWith('\r') ? carry.slice(0, -1) : carry;
    yield parseLine(line, lineNumber);
  }
}
