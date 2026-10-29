import type { DigestRow, NightDigest } from '../digest/types.js';

const dash = '—';

function Row({ row }: { row: DigestRow }) {
  const failed = row.lastStatus === 'fail';
  const retried = row.retries >= 3;
  return (
    <tr class={failed ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{row.owner ?? dash}</td>
      <td>{row.runs}</td>
      <td class={retried ? 'warn' : undefined}>{row.retries}</td>
      <td>{row.lastStatus}</td>
      <td>{row.lastError ?? dash}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  const { rows, badLines } = digest;
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {badLines > 0 && (
        <p class="warn">{badLines === 1 ? '1 line could not be read' : `${badLines} lines could not be read`}</p>
      )}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function NotFoundPage({ what }: { what: string }) {
  return (
    <>
      <h1>not found</h1>
      <p class="mute">{what}</p>
    </>
  );
}
