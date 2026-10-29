// Plan morning-digest § 1. The contract for the digest page, JSON route and board links.
// Implementation: `readNight` in `src/digest/read.ts`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// Lines per status. Used per row and per night (board: ok / retry / fail beside each night).
export type StatusCounts = { ok: number; retry: number; fail: number };

// One row per job in a night. Times are kept exactly as in the log, offset included; never UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's latest line; null stays null (views render `—`)
  runs: number; // number of valid lines for this job
  retries: number; // number of `retry` lines for this job
  counts: StatusCounts; // valid lines for this job by status; ok + retry + fail === runs
  lastStatus: RunStatus; // status of the job's latest line (latest = last in file order)
  lastError: string | null; // latest `error` seen for this job in the night, even if a later line is ok; null if none
  firstAt: string; // `at` of the job's first line in file order
  lastAt: string; // `at` of the job's latest line in file order
};

export type NightDigest = {
  night: string; // YYYY-MM-DD, as in runs/<night>.jsonl
  rows: DigestRow[]; // sorted by job (plain string order); [] for an empty file ("nothing ran")
  badLines: number; // non-blank lines that are not JSON or not the right shape; never thrown
  statusCounts: StatusCounts; // all valid lines of the night by status
};

// Reads `<runsDir>/<night>.jsonl`. Returns null when there is no file for that night, or when
// `night` is not YYYY-MM-DD (so it can't escape runsDir): routes answer 404 on null.
// An empty file returns a NightDigest with rows [] and badLines 0. Blank lines are ignored.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
