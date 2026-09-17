// A single card's scheduling state, as tracked by an SM-2 style spaced
// repetition algorithm. This is the unit the schedline format serializes.
export interface ScheduleRecord {
  /** stable card identifier, chosen by the caller, no whitespace */
  id: string;
  /** next due date, calendar day, no time zone */
  due: string; // YYYY-MM-DD
  /** current interval in days until the next review */
  ivl: number;
  /** ease factor; 2.5 is the SM-2 default, floor of 1.3 */
  ease: number;
  /** number of successful reviews in a row */
  reps: number;
  /** number of times this card has been forgotten */
  lapses: number;
}

export interface ParseIssue {
  line: number;
  message: string;
  raw: string;
}

export type ParseResult =
  | { ok: true; line: number; record: ScheduleRecord }
  | { ok: false; line: number; issue: ParseIssue };
