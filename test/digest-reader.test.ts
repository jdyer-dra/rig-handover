import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-runs-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('has 5 jobs, sorted by job, and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('fixtures/refresh: 4 runs, 3 retries, last ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      counts: { ok: 1, retry: 3, fail: 0 },
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('notes/backup: last fail with its error', () => {
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('notes/backup')?.lastError).toBe('quota exceeded');
  });

  it('digest/render keeps the row with owner null', () => {
    expect(row('digest/render')?.owner).toBeNull();
    expect(row('digest/render')?.runs).toBe(1);
  });

  it('keeps times with their offset and counts lines by status', () => {
    expect(row('rig/rotate-logs')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
    expect(night?.statusCounts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(tmp, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull();
  });

  it('reads an empty file as no rows and no bad lines', () => {
    writeFileSync(join(tmp, '2026-01-02.jsonl'), '');
    expect(readNight(tmp, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      statusCounts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('skips blank lines and counts wrong-shape lines as bad', () => {
    const lines = [
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '',
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '[1,2]',
      '{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"ok","owner":7}',
      '',
    ];
    writeFileSync(join(tmp, '2026-01-03.jsonl'), lines.join('\n'));
    const night = readNight(tmp, '2026-01-03');
    expect(night?.badLines).toBe(3);
    expect(night?.rows).toHaveLength(1);
    expect(night?.rows[0]?.lastError).toBeNull();
  });
});
