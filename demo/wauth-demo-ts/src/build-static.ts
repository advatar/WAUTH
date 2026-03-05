import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runTaxDemoScenario } from "./engine.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const result = await runTaxDemoScenario();
const dist = resolve(process.cwd(), "dist");
await mkdir(dist, { recursive: true });

await writeFile(
  resolve(dist, "result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8"
);

const receiptRows = result.receipts
  .map((receipt) => {
    return `<tr><td>${escapeHtml(receipt.rp)}</td><td>${escapeHtml(receipt.transaction_id)}</td><td><code>${escapeHtml(receipt.action_hash)}</code></td><td>${escapeHtml(receipt.capability_jti)}</td></tr>`;
  })
  .join("\n");

const timelineRows = result.timeline
  .map((event) => {
    return `<tr><td>${escapeHtml(event.at)}</td><td>${escapeHtml(event.type)}</td><td><code>${escapeHtml(JSON.stringify(event.detail))}</code></td></tr>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>WAUTH Demo (TypeScript)</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; line-height: 1.4; color: #1f2937; background: #f8fafc; }
      h1, h2 { margin: 0 0 12px 0; }
      .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px 6px; vertical-align: top; }
      th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .ok { color: #166534; font-weight: 600; }
      .meta { color: #475569; }
      a { color: #0369a1; }
    </style>
  </head>
  <body>
    <h1>WAUTH Demo (TypeScript)</h1>
    <div class="card">
      <div>Status: <span class="ok">${result.ok ? "OK" : "FAILED"}</span></div>
      <div class="meta">Issuer: ${escapeHtml(result.metadata.issuer)}</div>
      <div class="meta">Receipts: ${result.receipts.length} | Timeline Events: ${result.timeline.length}</div>
      <div class="meta"><a href="./result.json">Download JSON output</a></div>
    </div>

    <div class="card">
      <h2>Receipts</h2>
      <table>
        <thead>
          <tr><th>RP</th><th>Transaction</th><th>Action Hash</th><th>Capability JTI</th></tr>
        </thead>
        <tbody>
          ${receiptRows}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Timeline</h2>
      <table>
        <thead>
          <tr><th>At</th><th>Type</th><th>Detail</th></tr>
        </thead>
        <tbody>
          ${timelineRows}
        </tbody>
      </table>
    </div>
  </body>
</html>
`;

await writeFile(resolve(dist, "index.html"), html, "utf8");
console.log(`Wrote static demo output to ${dist}`);
