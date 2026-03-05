import { describe, expect, it } from "vitest";

import { WauthDemoEnvironment, runTaxDemoScenario } from "../src/engine.js";

describe("wauth demo tax scenario", () => {
  it("runs bank+employer+irs flow end-to-end and emits receipts", async () => {
    const result = await runTaxDemoScenario();

    expect(result.ok).toBe(true);
    expect(result.receipts).toHaveLength(3);
    expect(result.receipts.map((receipt) => receipt.rp).sort()).toEqual([
      "BankRP",
      "EmployerRP",
      "IRSRP"
    ]);
    for (const receipt of result.receipts) {
      expect(receipt.action_hash.length).toBeGreaterThanOrEqual(16);
      expect(receipt.capability_jti.length).toBeGreaterThan(0);
    }

    const acceptedEvents = result.timeline.filter((event) => event.type === "rp.accepted");
    const elicitationEvents = result.timeline.filter((event) => event.type === "wallet.elicitation");

    expect(acceptedEvents).toHaveLength(3);
    expect(elicitationEvents).toHaveLength(3);
  });

  it("keeps timeline and credential-store receipts consistent", async () => {
    const env = await WauthDemoEnvironment.create();
    const result = await env.runTaxDemoScenario();

    const storedReceipts = env.getStoredReceipts();
    expect(storedReceipts).toHaveLength(result.receipts.length);

    const timeline = env.getTimeline();
    expect(timeline.length).toBe(result.timeline.length);
    expect(timeline.some((event) => event.type === "wallet.metadata_checked")).toBe(true);
  });
});
