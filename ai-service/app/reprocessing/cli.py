"""Manual operator client. Tokens are prompted in memory and never saved."""
import argparse
import getpass
import json
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener

from app.shared.source_extraction import _NoRedirect
from app.shared.identities import parse_id


def api_url(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in {"", "/"}
            or (parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"})):
        raise argparse.ArgumentTypeError("Use an HTTPS API origin, or a loopback HTTP QA origin")
    return value.rstrip("/") + "/api/v2/taxonomy/reprocessing"


def request_json(origin: str, token: str, path: str, body: dict | None = None, *, key: str | None = None,
                 post: bool = False) -> dict:
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if key:
        headers["Idempotency-Key"] = key
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    request = Request(origin + path, data=data, headers=headers, method="POST" if post or body is not None else "GET")
    try:
        with build_opener(_NoRedirect()).open(request, timeout=7200) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError("API response exceeds the bounded metadata limit")
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("Unexpected API response")
        return value
    except HTTPError as error:
        status = error.code
        error.close()
        raise RuntimeError(f"API request failed with HTTP {status}; token/body are not printed") from None
    except (URLError, TimeoutError):
        raise RuntimeError("API is unavailable; resume the same batch when the service is reachable") from None


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview and operate an audited local-AI reprocessing batch")
    parser.add_argument("--api-url", required=True, type=api_url)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("preview", "create"):
        command = commands.add_parser(name)
        command.add_argument("--operation", choices=["PARSE_CV", "PARSE_JD", "MATCH_APPLICATION"], required=True)
        command.add_argument("--resource", action="append", type=parse_id)
        command.add_argument("--taxonomy-version")
        command.add_argument("--as-of-month")
        if name == "create":
            command.add_argument("--preview-hash", required=True)
            command.add_argument("--reason", required=True)
            command.add_argument("--idempotency-key", required=True)
    for name in ("get", "step", "run", "pause", "resume"):
        command = commands.add_parser(name)
        command.add_argument("batch_id", type=parse_id)
        if name in {"pause", "resume"}:
            command.add_argument("--reason", required=True)
        if name == "run":
            command.add_argument("--max-steps", type=int, default=1000)
    args = parser.parse_args()
    if args.command == "run" and not 1 <= args.max_steps <= 1000:
        parser.error("max-steps must be 1–1000")
    token = getpass.getpass("Admin access token (kept in memory only): ").strip()
    if not token:
        parser.error("A current Admin access token is required")
    try:
        if args.command in {"preview", "create"}:
            body = {"operation": args.operation}
            resources = [str(value) for value in args.resource] if args.resource is not None else None
            for field, value in (("resourceIds", resources), ("taxonomyVersion", args.taxonomy_version), ("asOfMonth", args.as_of_month)):
                if value is not None:
                    body[field] = value
            if args.command == "create":
                body.update(previewHash=args.preview_hash, reason=args.reason)
                result = request_json(args.api_url, token, "/batches", body, key=args.idempotency_key)
            else:
                result = request_json(args.api_url, token, "/impact", body)
        else:
            path = "/batches/" + str(args.batch_id)
            if args.command in {"pause", "resume"}:
                state = request_json(args.api_url, token, path)
                result = request_json(args.api_url, token, path + "/control",
                                      {"version": state["version"], "action": args.command.upper(), "reason": args.reason})
            elif args.command == "get":
                result = request_json(args.api_url, token, path)
            elif args.command == "step":
                result = request_json(args.api_url, token, path + "/step", post=True)
            else:
                result = request_json(args.api_url, token, path)
                for _ in range(args.max_steps):
                    if result["state"] != "RUNNING":
                        break
                    step = request_json(args.api_url, token, path + "/step", post=True)
                    result = step["batch"]
                    if not step["claimed"] and result["state"] == "RUNNING":
                        time.sleep(2)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (RuntimeError, ValueError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
