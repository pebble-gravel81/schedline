import type { ScheduleRecord } from './types.js';

/**
 * Renders one record in canonical field order, so two schedule files that
 * describe the same state diff as no changes in git regardless of the
 * order fields were written in originally.
 */
export function formatRecord(record: ScheduleRecord): string {
  return [
    `id=${record.id}`,
    `due=${record.due}`,
    `ivl=${record.ivl}`,
    `ease=${record.ease.toFixed(2)}`,
    `reps=${record.reps}`,
    `lapses=${record.lapses}`,
  ].join('\t');
}

/** Pretty-prints a full in-memory batch of records, one per line. */
export function formatRecords(records: Iterable<ScheduleRecord>): string {
  const lines: string[] = [];
  for (const record of records) {
    lines.push(formatRecord(record));
  }
  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/**
 * Streaming counterpart of formatRecords: yields one formatted line at a
 * time so a caller writing to a file or socket never has to materialize
 * the whole document as a single string.
 */
export async function* printStream(
  records: AsyncIterable<ScheduleRecord> | Iterable<ScheduleRecord>
): AsyncGenerator<string> {
  for await (const record of records) {
    yield formatRecord(record) + '\n';
  }
}
