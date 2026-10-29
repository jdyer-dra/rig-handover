import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-'));

const ok = (at: string, job: string, owner: string | null) =>
  JSON.stringify({ at, job, status: 'ok', owner });
const retry = (at: string, job: string, owner: string | null) =>
  JSON.stringify({ at, job, status: 'retry', owner, error: 'upstream 503' });
const fail = (at: string, job: string, owner: string | null) =>
  JSON.stringify({ at, job, status: 'fail', owner, error: 'quota exceeded' });

const NIGHT = '2026-11-01';
const EMPTY = '2026-11-02';
const BAD = '2026-11-03';
const MISSING = '2026-11-09';

beforeAll(() => {
  writeFileSync(
    join(runsDir, `${NIGHT}.jsonl`),
    [
      ok('2026-11-01T01:00:00+01:00', 'lane/sync', 'rook'),
      ok('2026-11-01T01:02:00+01:00', 'digest/render', null),
      retry('2026-11-01T01:10:00+01:00', 'fixtures/refresh', 'rook'),
      retry('2026-11-01T01:11:00+01:00', 'fixtures/refresh', 'rook'),
      retry('2026-11-01T01:12:00+01:00', 'fixtures/refresh', 'rook'),
      ok('2026-11-01T01:13:00+01:00', 'fixtures/refresh', 'rook'),
      fail('2026-11-01T01:20:00+01:00', 'notes/backup', 'rook'),
      ok('2026-11-01T01:30:00+01:00', 'lane/sync', 'rook'),
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      ok('2026-11-03T01:00:00+01:00', 'lane/sync', 'rook'),
      'this is not json',
      ok('2026-11-03T01:05:00+01:00', 'digest/render', 'rook'),
    ].join('\n'),
  );
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
};
const app = createApp(config);

// Job names in table order, from the page's body rows (the first cell of each row).
function pageJobs(html: string): string[] {
  return [...html.matchAll(/<tr(?: class="warn")?><td>([^<]+)<\/td>/g)].map((m) => m[1] ?? '');
}

// The `<tr>` markup of one job on the page.
function pageRow(html: string, job: string): string {
  const row = html.split('<tr').find((s) => s.includes(`<td>${job}</td>`));
  if (row === undefined) throw new Error(`no row for ${job}`);
  return row;
}

describe('GET /digest/:night', () => {
  it('answers 200 and lists every job of the night', async () => {
    const res = await app.request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(pageJobs(html)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup']);
  });

  it('marks a row whose latest status is fail with class warn', async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    expect(pageRow(html, 'notes/backup')).toMatch(/^ class="warn"><td>notes\/backup<\/td>/);
    expect(pageRow(html, 'lane/sync')).toMatch(/^>/);
  });

  it('marks the retries cell with class warn when retries >= 3', async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    expect(pageRow(html, 'fixtures/refresh')).toContain('<td class="warn">3</td>');
    expect(pageRow(html, 'lane/sync')).not.toContain('class="warn"');
  });

  it('renders a null owner as —', async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    expect(pageRow(html, 'digest/render')).toContain('<td>—</td>');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with one row per job, sorted', async () => {
    const res = await app.request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
    ]);
  });
});

describe('a night with no file', () => {
  it('GET /digest/:night answers 404 with the not-found page', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(`no digest for ${MISSING}`);
  });

  it('GET /api/digest/:night answers 404 with an error body', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: MISSING });
  });
});

describe('an empty night', () => {
  it('GET /digest/:night says nothing ran and shows no table', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('GET /api/digest/:night answers rows: []', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      night: EMPTY,
      rows: [],
      badLines: 0,
      statusCounts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});

describe('a night with a bad line', () => {
  it('GET /digest/:night still answers 200, mentions the unreadable line and lists the jobs', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(pageJobs(html)).toEqual(['digest/render', 'lane/sync']);
  });

  it('GET /api/digest/:night still answers 200 with badLines: 1', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { badLines: number; rows: { job: string }[] };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'lane/sync']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as { rows: { job: string }[] };
    expect(pageJobs(html)).toEqual(body.rows.map((r) => r.job));
  });
});
