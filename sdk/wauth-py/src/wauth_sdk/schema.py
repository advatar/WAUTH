import json
import pathlib
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from jsonschema import Draft202012Validator, RefResolver


@dataclass
class SchemaValidationResult:
    ok: bool
    errors: List[str]


class WauthSchemaRegistry:
    def __init__(self, schema_dir: pathlib.Path):
        self.schema_dir = schema_dir
        self._store: Dict[str, Dict[str, Any]] = {}
        self._file_to_schema_id: Dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        for schema_path in sorted(self.schema_dir.glob("*.json")):
            raw = json.loads(schema_path.read_text(encoding="utf-8"))
            canonical_id = raw.get("$id") if isinstance(raw.get("$id"), str) else f"https://schemas.aaif.io/wauth/{schema_path.name}"
            alias_id = f"https://schemas.aaif.io/wauth/{schema_path.name}"

            canonical_schema = dict(raw)
            canonical_schema["$id"] = canonical_id

            alias_schema = dict(raw)
            alias_schema["$id"] = alias_id

            self._store[canonical_id] = canonical_schema
            self._store[alias_id] = alias_schema
            self._file_to_schema_id[schema_path.name] = alias_id

    def validate_by_file_name(self, schema_file_name: str, instance: Any) -> SchemaValidationResult:
        schema_id = self._file_to_schema_id.get(schema_file_name)
        if not schema_id:
            return SchemaValidationResult(ok=False, errors=[f"unknown schema file: {schema_file_name}"])
        return self.validate_by_schema_id(schema_id, instance)

    def validate_by_schema_id(self, schema_id: str, instance: Any) -> SchemaValidationResult:
        schema = self._store.get(schema_id)
        if schema is None:
            return SchemaValidationResult(ok=False, errors=[f"schema not loaded: {schema_id}"])

        resolver = RefResolver.from_schema(schema, store=self._store)
        validator = Draft202012Validator(schema, resolver=resolver)
        errors = [
            f"{error.json_path}: {error.message}"
            for error in sorted(validator.iter_errors(instance), key=lambda e: e.json_path)
        ]
        return SchemaValidationResult(ok=len(errors) == 0, errors=errors)
