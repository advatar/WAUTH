import { runTaxDemoScenario } from "./engine.js";

const result = await runTaxDemoScenario();

console.log(JSON.stringify({
  ok: result.ok,
  receipt_count: result.receipts.length,
  receipts: result.receipts,
  timeline_events: result.timeline.length
}, null, 2));
