#!/usr/bin/env node
import { createReadStream, createWriteStream } from 'node:fs';
import { parseStream } from './parser.js';
import { formatRecord } from './printer.js';
import type { ParseIssue, ScheduleRecord } from './types.js';

function usage(): string {
  return [
    'usage: schedline <command> [args]',
    '',
    'commands:',
    '  validate <file>            check a schedline file for errors',
    '  format <file> [-o out]     rewrite a file in canonical field order',
    '  diff <file-a> <file-b>     show which records were added, removed, or changed, by id',
  ].join('\n');
}

interface Collected {
  path: string;
  records: ScheduleRecord[];
  issues: ParseIssue[];
}

async function collect(path: string): Promise<Collected> {
  const records: ScheduleRecord[] = [];
  const issues: ParseIssue[] = [];
  for await (const result of parseStream(createReadStream(path, { encoding: 'utf8' }))) {
    if (result.ok) {
      records.push(result.record);
    } else {
      issues.push(result.issue);
    }
  }
  return { path, records, issues };
}

function reportIssues({ path, issues }: Collected): void {
  for (const issue of issues) {
    console.error(`${path}:${issue.line}: ${issue.message}`);
  }
}

async function runValidate(args: string[]): Promise<number> {
  const [path] = args;
  if (!path) {
    console.error('validate: missing file argument');
    return 2;
  }
  const result = await collect(path);
  reportIssues(result);
  if (result.issues.length > 0) {
    console.error(`${result.issues.length} invalid line(s), ${result.records.length} valid`);
    return 1;
  }
  console.error(`${result.records.length} valid record(s)`);
  return 0;
}

async function writeOutput(text: string, outPath: string | undefined): Promise<void> {
  if (!outPath) {
    process.stdout.write(text);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(outPath);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(text);
  });
}

async function runFormat(args: string[]): Promise<number> {
  const [path, ...rest] = args;
  if (!path) {
    console.error('format: missing file argument');
    return 2;
  }
  let outPath: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '-o' || rest[i] === '--out') {
      outPath = rest[i + 1];
      i++;
    }
  }

  const result = await collect(path);
  if (result.issues.length > 0) {
    reportIssues(result);
    console.error(`refusing to format: ${result.issues.length} invalid line(s)`);
    return 1;
  }

  const text = result.records.map((record) => formatRecord(record) + '\n').join('');
  await writeOutput(text, outPath);
  return 0;
}

// Only the fields that actually describe scheduling progress are compared;
// `id` is the join key, not a change.
const DIFFABLE_FIELDS: readonly (keyof ScheduleRecord)[] = ['due', 'ivl', 'ease', 'reps', 'lapses'];

function fieldChanges(a: ScheduleRecord, b: ScheduleRecord): string[] {
  const changes: string[] = [];
  for (const key of DIFFABLE_FIELDS) {
    if (a[key] !== b[key]) {
      changes.push(`  ${key}: ${a[key]} -> ${b[key]}`);
    }
  }
  return changes;
}

async function runDiff(args: string[]): Promise<number> {
  const [pathA, pathB] = args;
  if (!pathA || !pathB) {
    console.error('diff: expected two file arguments');
    return 2;
  }

  const [a, b] = await Promise.all([collect(pathA), collect(pathB)]);
  let hadIssues = false;
  if (a.issues.length > 0) {
    reportIssues(a);
    hadIssues = true;
  }
  if (b.issues.length > 0) {
    reportIssues(b);
    hadIssues = true;
  }
  if (hadIssues) {
    console.error('refusing to diff: invalid input');
    return 1;
  }

  const byIdA = new Map(a.records.map((record) => [record.id, record]));
  const byIdB = new Map(b.records.map((record) => [record.id, record]));
  const ids = Array.from(new Set([...byIdA.keys(), ...byIdB.keys()])).sort();

  let changed = false;
  for (const id of ids) {
    const recordA = byIdA.get(id);
    const recordB = byIdB.get(id);
    if (!recordA) {
      console.log(`+ ${formatRecord(recordB!)}`);
      changed = true;
    } else if (!recordB) {
      console.log(`- ${formatRecord(recordA)}`);
      changed = true;
    } else {
      const changes = fieldChanges(recordA, recordB);
      if (changes.length > 0) {
        console.log(`~ ${id}`);
        for (const line of changes) console.log(line);
        changed = true;
      }
    }
  }

  return changed ? 1 : 0;
}

async function main(): Promise<number> {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case 'validate':
      return runValidate(rest);
    case 'format':
      return runFormat(rest);
    case 'diff':
      return runDiff(rest);
    case '-h':
    case '--help':
      console.log(usage());
      return 0;
    case undefined:
      console.error(usage());
      return 2;
    default:
      console.error(`unknown command "${command}"`);
      console.error(usage());
      return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
