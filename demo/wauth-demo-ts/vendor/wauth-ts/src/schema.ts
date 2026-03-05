import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import type { JsonValue } from "./types.js";

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}

interface LoadedSchema {
  fileName: string;
  canonicalId: string;
  aliasId: string;
  canonicalSchema: Record<string, unknown>;
  aliasSchema: Record<string, unknown>;
}

function readSchemaFile(schemaDir: string, fileName: string): LoadedSchema {
  const absolute = resolve(schemaDir, fileName);
  const parsed = JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;

  const canonicalId = typeof parsed.$id === "string"
    ? parsed.$id
    : `https://schemas.aaif.io/wauth/${fileName}`;
  const aliasId = `https://schemas.aaif.io/wauth/${fileName}`;

  const canonicalSchema = { ...parsed, $id: canonicalId };
  const aliasSchema = { ...parsed, $id: aliasId };

  return {
    fileName,
    canonicalId,
    aliasId,
    canonicalSchema,
    aliasSchema
  };
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) {
    return [];
  }
  return errors.map((error) => {
    const path = error.instancePath || "/";
    return `${path}: ${error.message}`;
  });
}

export class WauthSchemaRegistry {
  private readonly ajv = new Ajv2020({ allErrors: true, strict: false });
  private readonly fileToSchemaId = new Map<string, string>();

  constructor(schemaDir: string) {
    addFormats(this.ajv);
    const files = readdirSync(schemaDir)
      .filter((file) => file.endsWith(".json"))
      .sort();

    for (const file of files) {
      const loaded = readSchemaFile(schemaDir, file);
      if (!this.ajv.getSchema(loaded.canonicalId)) {
        this.ajv.addSchema(loaded.canonicalSchema, loaded.canonicalId);
      }
      if (!this.ajv.getSchema(loaded.aliasId)) {
        this.ajv.addSchema(loaded.aliasSchema, loaded.aliasId);
      }
      this.fileToSchemaId.set(file, loaded.aliasId);
    }
  }

  validateByFileName(schemaFileName: string, instance: JsonValue): SchemaValidationResult {
    const schemaId = this.fileToSchemaId.get(schemaFileName);
    if (!schemaId) {
      return { ok: false, errors: [`unknown schema file: ${schemaFileName}`] };
    }

    return this.validateBySchemaId(schemaId, instance);
  }

  validateBySchemaId(schemaId: string, instance: JsonValue): SchemaValidationResult {
    const validator = this.ajv.getSchema(schemaId);
    if (!validator) {
      return { ok: false, errors: [`schema not loaded: ${schemaId}`] };
    }

    const valid = validator(instance);
    return {
      ok: valid === true,
      errors: formatErrors(validator.errors)
    };
  }
}
