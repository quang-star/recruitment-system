"""Numeric identity boundary: integer internally, exact decimal string in JSON."""
from typing import Annotated

from pydantic import BeforeValidator, PlainSerializer, WithJsonSchema

from app.shared.identities import parse_id

BusinessId = Annotated[int, BeforeValidator(parse_id), PlainSerializer(str, return_type=str, when_used="json"),
                       WithJsonSchema({"type": "string", "pattern": "^[1-9][0-9]{0,18}$", "maxLength": 19,
                                       "description": "Positive BIGINT identity, at most 9223372036854775807."})]
