"""Positive numeric business identities; technical UUID fixtures stay separate."""
from itertools import count
from hashlib import sha256
import json
from pathlib import Path

_ids = count(10000)
_seed = json.loads((Path(__file__).resolve().parents[2] / 'contracts/taxonomy/it-skills-v1.seed.json').read_text(encoding='utf-8'))
_legacy = {skill['stableId']: index for index, skill in enumerate(_seed['skills'], 1)}


def new_id():
    return next(_ids)


def legacy_id(value):
    return _legacy.get(value, (int.from_bytes(sha256(value.encode()).digest()[:8], 'big') & ((1 << 63) - 1)) or 1)
