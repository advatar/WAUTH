import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WauthSchemaRegistry } from "../src/schema.js";

function loadJson(pathFromRepoRoot: string): any {
  const absolute = resolve(process.cwd(), "../..", pathFromRepoRoot);
  return JSON.parse(readFileSync(absolute, "utf8"));
}

describe("wauth-ts schema validation", () => {
  it("validates an example using absolute and relative refs", () => {
    const schemaDir = resolve(process.cwd(), "../..", "schemas");
    const registry = new WauthSchemaRegistry(schemaDir);
    const example = loadJson("examples/rp-wauth-required-example.json");

    const result = registry.validateByFileName("wauth-required.v0.2.schema.json", example);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed payloads", () => {
    const schemaDir = resolve(process.cwd(), "../..", "schemas");
    const registry = new WauthSchemaRegistry(schemaDir);
    const result = registry.validateByFileName("wauth-agent-link.v0.1.schema.json", {
      relation: "peer"
    });

    expect(result.ok).toBe(false);
  });

  it("validates schema/example pairs from shared map", () => {
    const schemaDir = resolve(process.cwd(), "../..", "schemas");
    const registry = new WauthSchemaRegistry(schemaDir);
    const map = loadJson("sdk/wauth-conformance/schema-example-map.json") as {
      pairs: Array<{ example: string; schema: string }>;
    };

    for (const pair of map.pairs) {
      const example = loadJson(pair.example);
      const schemaFileName = pair.schema.split("/").at(-1) ?? pair.schema;
      const result = registry.validateByFileName(schemaFileName, example);
      expect(result.ok, `${pair.example} vs ${pair.schema}: ${result.errors.join("; ")}`).toBe(true);
    }
  });
});
