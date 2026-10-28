import importlib.util
import json
from pathlib import Path
from uuid import uuid4

import pytest

spec = importlib.util.spec_from_file_location('identity_handoff', Path(__file__).resolve().parents[2] / 'scripts/business-identity-map.py')
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


def test_handoff_preserves_aliases_and_full_bigint_precision(tmp_path):
    file = tmp_path / 'ai-map.json'
    payload = {'format': 'business-identity-map/1', 'service': 'ai', 'mappings': [
        {'entityType': 'task', 'legacyId': str(uuid4()), 'id': '9223372036854775807'},
        {'entityType': 'task', 'legacyId': str(uuid4()), 'id': '9223372036854775807'}]}
    file.write_text(json.dumps(payload), encoding='utf-8')
    assert [row['identity'] for row in handoff.read_mapping(file)] == [9223372036854775807, 9223372036854775807]


@pytest.mark.parametrize('identity', [1, '0', '01', '-1', '1.0', '9223372036854775808'])
def test_handoff_rejects_unsafe_mapping_before_opening_a_database(tmp_path, identity):
    file = tmp_path / 'bad-map.json'
    file.write_text(json.dumps({'format': 'business-identity-map/1', 'service': 'core', 'mappings': [
        {'entityType': 'cv_version', 'legacyId': str(uuid4()), 'id': identity}]}), encoding='utf-8')
    with pytest.raises(ValueError):
        handoff.read_mapping(file)
