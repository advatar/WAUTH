export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface MonotonicityResult {
  ok: boolean;
  reasons: string[];
}
