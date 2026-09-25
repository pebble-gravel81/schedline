import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parseStream } from './parser.js';
import { formatRecord, formatRecords } from './printer.js';
import type { ScheduleRecord } from './types.js';

// Small deterministic PRNG (mulberry32) so failures are reproducible without
// pulling in a property-testing library. A fixed seed is enough here: the
// point is broad coverage of the field space and of chunk boundaries, not
// true randomness.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysInMonth(year: number, month: number): number {
  // month is 1-based; passing it as the (0-based) month argument means
  // "day 0" lands on the last day of the previous month, which is the
  // month we actually asked about.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function randomRecord(rand: () => number, index: number): ScheduleRecord {
  const year = 1970 + Math.floor(rand() * 130);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * daysInMonth(year, month));
  const pad = (n: number, width: number) => String(n).padStart(width, '0');

  // Round at generation time, not just at print time: ease.toFixed(2) is
  // the only thing that survives the trip through text, so the generated
  // value has to already be exactly what that rounding would produce, or
  // floating point noise from the random draw makes the equality check flaky.
  const ease = Number((1.3 + Math.floor(rand() * 370) / 100).toFixed(2));

  return {
    id: `card-${index}-${Math.floor(rand() * 1_000_000)}`,
    due: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
    ivl: Math.floor(rand() * 10_000),
    ease,
    reps: Math.floor(rand() * 1_000),
    lapses: Math.floor(rand() * 100),
  };
}

// Splits text into a handful of randomly sized pieces, including splits
// that fall in the middle of a line, so parseStream's carry buffer is
// exercised at every possible boundary, not just clean line breaks.
function randomChunks(text: string, rand: () => number): string[] {
  if (text.length === 0) return [text];
  const cutCount = Math.floor(rand() * 12);
  const cuts = new Set<number>();
  for (let i = 0; i < cutCount; i++) {
    cuts.add(1 + Math.floor(rand() * (text.length - 1)));
  }
  const sorted = Array.from(cuts).sort((a, b) => a - b);
  const chunks: string[] = [];
  let start = 0;
  for (const cut of sorted) {
    chunks.push(text.slice(start, cut));
    start = cut;
  }
  chunks.push(text.slice(start));
  return chunks;
}

async function* toAsyncIterable(chunks: string[]): AsyncGenerator<string | Buffer> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

test('formatRecord -> parseLine reproduces the original record', () => {
  const rand = mulberry32(0xc0ffee);
  for (let i = 0; i < 500; i++) {
    const record = randomRecord(rand, i);
    const result = parseLine(formatRecord(record), 1);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.record, record);
    }
  }
});

test('formatRecords -> parseStream reproduces the original batch across arbitrary chunk boundaries', async () => {
  const rand = mulberry32(0x5eed5eed);
  for (let trial = 0; trial < 50; trial++) {
    const count = Math.floor(rand() * 30);
    const records: ScheduleRecord[] = [];
    for (let i = 0; i < count; i++) {
      records.push(randomRecord(rand, i));
    }

    const text = formatRecords(records);
    const chunks = randomChunks(text, rand);

    const parsed: ScheduleRecord[] = [];
    for await (const result of parseStream(toAsyncIterable(chunks))) {
      assert.equal(result.ok, true, result.ok ? undefined : result.issue.message);
      if (result.ok) parsed.push(result.record);
    }

    assert.deepEqual(parsed, records);
  }
});

test('parseLine -> formatRecord -> parseLine is idempotent on already-canonical input', () => {
  const rand = mulberry32(0x1234abcd);
  for (let i = 0; i < 200; i++) {
    const record = randomRecord(rand, i);
    const once = formatRecord(record);
    const parsedOnce = parseLine(once, 1);
    assert.equal(parsedOnce.ok, true);
    if (!parsedOnce.ok) continue;
    const twice = formatRecord(parsedOnce.record);
    assert.equal(twice, once);
  }
});
