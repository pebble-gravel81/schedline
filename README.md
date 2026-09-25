# schedline

A text format for spaced repetition schedules, plus a validating parser and
a pretty printer for it, written in TypeScript with no dependencies.

## the problem

Most spaced repetition tools (flashcard apps, personal SRS scripts, that
Anki export you keep meaning to process) end up needing to move review
state around: card id, due date, interval, ease factor, review count,
lapse count. JSON works until you want to diff two schedule snapshots in
git and see which cards actually moved, or until the export is a few
hundred megabytes and you don't want to hold the whole array in memory to
check it for corruption.

schedline is a line-oriented format for exactly that state, one record per
card per line, designed to be greppable, diffable, and parseable a chunk
at a time.

## the format

One record per line, fields as tab-separated `key=value` pairs, any order
on input:

```
id=react-hooks	due=2026-09-20	ivl=6	ease=2.50	reps=3	lapses=0
id=css-grid	due=2026-09-15	ivl=1	ease=2.30	reps=1	lapses=2
```

Required fields: `id` (no whitespace), `due` (`YYYY-MM-DD`, a real
calendar date), `ivl` (non-negative integer, days), `ease` (number >=
1.3), `reps` and `lapses` (non-negative integers). Unknown or duplicate
fields, or a missing required field, make the line invalid; the parser
reports which line and why instead of throwing on the whole document.

## usage

Parsing a small string:

```ts
import { parseLine } from './src/parser.js';

const result = parseLine(
  'id=react-hooks\tdue=2026-09-20\tivl=6\tease=2.50\treps=3\tlapses=0',
  1
);

if (result.ok) {
  console.log(result.record.due); // "2026-09-20"
} else {
  console.error(`line ${result.issue.line}: ${result.issue.message}`);
}
```

Parsing a file as a stream, without ever holding the whole file in memory:

```ts
import { createReadStream } from 'node:fs';
import { parseStream } from './src/parser.js';

for await (const result of parseStream(createReadStream('reviews.schedline'))) {
  if (!result.ok) {
    console.error(`line ${result.issue.line}: ${result.issue.message}`);
    continue;
  }
  scheduleReview(result.record);
}
```

`parseStream` accepts any `AsyncIterable<string | Buffer>`, so it works
directly against a Node file stream, a `Readable`, or chunks pulled off a
socket. It only ever keeps the text since the last newline in memory, so
peak memory does not grow with input size.

Pretty printing back to canonical form:

```ts
import { formatRecords } from './src/printer.js';

const text = formatRecords([
  { id: 'react-hooks', due: '2026-09-20', ivl: 6, ease: 2.5, reps: 3, lapses: 0 },
]);
```

Fields are always emitted in the same order and `ease` is always rendered
to two decimal places, so re-printing an unchanged schedule produces a
byte-identical file, and a real change produces a small, readable diff.

## cli

Build once with `npm run build`, then:

```
node dist/cli.js validate reviews.schedline
node dist/cli.js format reviews.schedline -o reviews.schedline
node dist/cli.js diff before.schedline after.schedline
```

`validate` reports every invalid line (not just the first) and exits
non-zero if any were found. `format` rewrites a file to canonical field
order and exits non-zero without writing anything if the input has
errors. `diff` compares two files by `id` and prints additions (`+`),
removals (`-`), and per-field changes (`~`) for records that moved;
it exits non-zero if anything differs, so it works as a CI drift check.

## status

Format definition, streaming parser, in-memory and streaming printers,
and a CLI (`validate`, `format`, `diff`). Round-trip property tests cover
the parser and printer, including arbitrary chunk boundaries through
`parseStream`; run them with `npm test`. No scheduling algorithm yet
(this library handles the file format, not deciding when a card is next
due).

## license

MIT, see LICENSE.
