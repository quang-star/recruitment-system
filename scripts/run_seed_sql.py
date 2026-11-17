#!/usr/bin/env python3
"""Compatibility command: the portal seed now uses Gateway API v2, never SQL/Docker."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location('portal_seed', Path(__file__).with_name('seed-portal.py'))
assert _spec and _spec.loader
_portal = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_portal)


def main():
    return _portal.main()


if __name__ == '__main__':
    raise SystemExit(main())
