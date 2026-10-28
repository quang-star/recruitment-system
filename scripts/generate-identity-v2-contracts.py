"""Create versioned numeric-ID contracts; preserve every v1 artifact."""
import copy
import json
from pathlib import Path
import re
import yaml

ROOT = Path(__file__).resolve().parents[1] / "contracts"
MAXIMUM = "9223372036854775807"
parts = [r"[1-9][0-9]{0,17}"]
for index, digit in enumerate(MAXIMUM):
    low, high = (1 if index == 0 else 0), int(digit) - 1
    if low > high:
        continue
    choices = str(low) if low == high else f"[{low}-{high}]"
    suffix = len(MAXIMUM) - index - 1
    parts.append(MAXIMUM[:index] + choices + (f"[0-9]{{{suffix}}}" if suffix else ""))
parts.append(MAXIMUM)
PATTERN = "^(?:" + "|".join(parts) + ")$"
TECHNICAL = {"eventId", "correlationId", "causationId", "evidenceId", "evidenceIds", "leaseToken"}


def version_text(value):
    return value.replace("-v1.", "-v2.").replace(".v1", ".v2").replace(" v1", " v2").replace("/1.0", "/2.0")


def schema(value, path=()):
    if isinstance(value, dict):
        result = {key: schema(item, path + (key,)) for key, item in value.items()}
        if result.get("format") == "uuid" and not any(key in TECHNICAL or key == "evidence" for key in path):
            result.pop("format")
            result["pattern"] = PATTERN
            result["maxLength"] = 19
        if path == ("properties", "schemaVersion") and result.get("type") == "integer":
            result = {"const": 2}
        return result
    if isinstance(value, list):
        return [schema(item, path) for item in value]
    return version_text(value) if isinstance(value, str) else value


def save(path, value):
    data = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists():
        if path.read_text(encoding="utf-8") != data:
            raise RuntimeError(f"Existing v2 artifact differs; review it before regeneration: {path.name}")
        return
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(data)


for folder in ("schemas", "events"):
    for path in (ROOT / folder).glob("*-v1.schema.json"):
        data = schema(json.loads(path.read_text(encoding="utf-8")))
        if path.name in {"cv-processing-updated-v1.schema.json", "job-processing-updated-v1.schema.json"}:
            data["properties"]["processingTaskId"]["type"] = ["string", "null"]
        save(path.with_name(path.name.replace("-v1.", "-v2.")), data)

seed = json.loads((ROOT / "taxonomy/it-skills-v1.seed.json").read_text(encoding="utf-8"))
identities = {skill["stableId"]: str(index) for index, skill in enumerate(seed["skills"], 1)}


def payload(value, path=()):
    if isinstance(value, dict):
        return {key: payload(item, path + (key,)) for key, item in value.items()}
    if isinstance(value, list):
        return [payload(item, path) for item in value]
    if isinstance(value, str):
        if re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", value):
            if not any(key in TECHNICAL or key == "evidence" for key in path):
                if value not in identities:
                    identities[value] = str(100000 + len(identities))
                return identities[value]
        return version_text(value)
    return value


save(ROOT / "taxonomy/it-skills-v2.seed.json", payload(copy.deepcopy(seed)))
for path in (ROOT / "examples").glob("*-v1.example.json"):
    save(path.with_name(path.name.replace("-v1.", "-v2.")), payload(json.loads(path.read_text(encoding="utf-8"))))
print("Generated v2 ID contracts, seed and examples; v1 artifacts are unchanged.")


def openapi_schema(value, path=()):
    if isinstance(value, dict):
        result = {key.replace('/api/v1', '/api/v2'): openapi_schema(item, path + (key,)) for key, item in value.items()}
        technical = any(key in TECHNICAL or key in {'CorrelationId', 'evidence'} for key in path)
        if result.get('format') == 'uuid' and not technical:
            result.pop('format')
            result.update(pattern=PATTERN, maxLength=19)
        if path == ('info',):
            result['version'] = '2.0.0'
        return result
    if isinstance(value, list):
        return [openapi_schema(item, path) for item in value]
    if isinstance(value, str):
        return version_text(value).replace('/api/v1', '/api/v2')
    return value


for path in (ROOT / 'openapi').glob('*-v1.yaml'):
    target = path.with_name(path.name.replace('-v1.', '-v2.'))
    data = yaml.safe_dump(openapi_schema(yaml.safe_load(path.read_text(encoding='utf-8'))), sort_keys=False, allow_unicode=True)
    if target.exists():
        if target.read_text(encoding='utf-8') != data:
            raise RuntimeError(f'Existing v2 OpenAPI differs: {target.name}')
    else:
        with target.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(data)
