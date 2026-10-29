import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus, StatusCounts } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Parse at the edge: one log line in, a RunLine or null (bad line) out. Never throws.
export function parseLine(line: string): RunLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  const { at, job, status, owner, error } = v;
  if (typeof at !== 'string' || at === '') return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const parsed: RunLine = { at, job, status: status as RunStatus, owner };
  if (error !== undefined) parsed.error = error;
  return parsed;
}

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if (isRecord(e) && e.code === 'ENOENT') return null;
    throw e;
  }
}

const zero = (): StatusCounts => ({ ok: 0, retry: 0, fail: 0 });

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  const statusCounts = zero();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    statusCounts[line.status]++;
    let row = byJob.get(line.job);
    if (!row) {
      row = {
        job: line.job,
        owner: line.owner,
        runs: 0,
        retries: 0,
        counts: zero(),
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      byJob.set(line.job, row);
    }
    row.runs++;
    row.counts[line.status]++;
    if (line.status === 'retry') row.retries++;
    row.owner = line.owner;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    if (line.error !== undefined) row.lastError = line.error;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, statusCounts } satisfies NightDigest;
};
