"""Framework-free validation of positive BIGINT business identities."""
import re

MAX_ID = 2**63 - 1
# Canonical taxonomy identities and transient job-local claims must not alias.
JOB_SKILL_ID_MIN = 2**62


def parse_id(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("ID must be a positive BIGINT decimal string")
    if isinstance(value, int):
        result = value
    elif isinstance(value, str) and re.fullmatch(r"[1-9][0-9]{0,18}", value):
        result = int(value)
    else:
        raise ValueError("ID must be a positive BIGINT decimal string")
    if not 1 <= result <= MAX_ID:
        raise ValueError("ID exceeds the positive BIGINT range")
    return result
