import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('kind', ['parsed-cv', 'parsed-jd', 'cv-response'])
def test_v2_examples_validate(kind):
    schema = json.loads((ROOT / f'schemas/{kind}-v2.schema.json').read_text(encoding='utf-8'))
    payload = json.loads((ROOT / f'examples/{kind}-v2.example.json').read_text(encoding='utf-8'))
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(payload)


@pytest.mark.parametrize('identity', ['1', '9007199254740993', '9223372036854775807'])
def test_v2_ids_preserve_bigint_precision(identity):
    schema = json.loads((ROOT / 'events/application-submitted-v2.schema.json').read_text(encoding='utf-8'))
    Draft202012Validator(schema).validate(dict(applicationId=identity, cvVersionId=identity, jobVersionId=identity))


@pytest.mark.parametrize('identity', [0, 1, True, '', '0', '-1', '01', '+1', '1.0', '9223372036854775808', '9999999999999999999', '779494ac-c858-4570-a884-6e88423b8e2b'])
def test_v2_rejects_noncanonical_or_out_of_range_ids(identity):
    schema = json.loads((ROOT / 'events/application-submitted-v2.schema.json').read_text(encoding='utf-8'))
    with pytest.raises(ValidationError):
        Draft202012Validator(schema).validate(dict(applicationId=identity, cvVersionId='1', jobVersionId='1'))
