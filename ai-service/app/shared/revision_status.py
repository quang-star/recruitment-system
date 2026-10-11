from typing import Literal

from pydantic import TypeAdapter


ParsedRevisionStatus = Literal["PARSED", "CONFIRMED", "SUPERSEDED"]
_status_adapter: TypeAdapter[ParsedRevisionStatus] = TypeAdapter(ParsedRevisionStatus)


def validate_revision_status(status: str) -> ParsedRevisionStatus:
    return _status_adapter.validate_python(status)
