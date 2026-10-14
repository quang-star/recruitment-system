#!/usr/bin/env python3
"""Exercise password recovery and session revocation through public local APIs."""

from __future__ import annotations

import argparse
import json
import re
import time
from typing import Any
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from uuid import uuid4


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        self.status = status
        super().__init__(f"HTTP {status}: {body}")


class Client:
    def __init__(self, gateway: str, mailpit: str):
        self.gateway = gateway.rstrip("/")
        self.mailpit = mailpit.rstrip("/")
        self.opener = build_opener(ProxyHandler({}))

    def request(self, method: str, path: str, payload: Any | None = None,
                token: str | None = None, *, mailpit: bool = False) -> Any:
        headers = {
            "Accept": "application/json",
            "User-Agent": "smart-recruitment-auth-smoke/1.0",
            "X-Correlation-Id": str(uuid4()),
        }
        body = None
        if payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(
            f"{self.mailpit if mailpit else self.gateway}{path}",
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as error:
            raise ApiError(error.code, error.read().decode(errors="replace")) from error
        return json.loads(raw) if raw else None


def login(client: Client, email: str, password: str, device: str) -> dict[str, Any]:
    return client.request("POST", "/api/v1/auth/login", {
        "email": email,
        "password": password,
        "clientType": "WEB",
        "deviceName": device,
    })


def message_ids(client: Client) -> set[str]:
    return {str(message["ID"]) for message in client.request("GET", "/api/v1/messages", mailpit=True)["messages"]}


def reset_token_from_message(client: Client, message: dict[str, Any], email: str) -> str | None:
    recipients = {recipient.get("Address", "").casefold() for recipient in message.get("To", [])}
    if email.casefold() not in recipients or "password" not in message.get("Subject", "").casefold():
        return None
    detail = client.request("GET", f"/api/v1/message/{message['ID']}", mailpit=True)
    match = re.search(r"token=([0-9a-f]{64})", f"{detail.get('Text', '')}\n{detail.get('HTML', '')}")
    return match.group(1) if match else None


def wait_for_reset_token(client: Client, email: str, previous_ids: set[str], reuse_latest: bool) -> str:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        messages = client.request("GET", "/api/v1/messages", mailpit=True)["messages"]
        for message in messages:
            if not reuse_latest and str(message["ID"]) in previous_ids:
                continue
            token = reset_token_from_message(client, message, email)
            if token:
                return token
        time.sleep(1)
    raise TimeoutError(f"No new password-reset email arrived for {email}")


def expect_login_rejected(client: Client, email: str, password: str) -> None:
    try:
        login(client, email, password, "Rejected old credential")
    except ApiError as error:
        if error.status == 401:
            return
        raise
    raise AssertionError("Old password was still accepted after reset")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gateway-url", default="http://localhost:8080")
    parser.add_argument("--mailpit-url", default="http://localhost:8025")
    parser.add_argument("--email", default="candidate.demo@smart.local")
    parser.add_argument("--password", default="DemoCandidate!2026")
    parser.add_argument("--temporary-password", default="RecoverySmoke!2026")
    parser.add_argument("--reuse-latest-reset", action="store_true",
                        help="resume the latest Mailpit reset token after an interrupted smoke run")
    args = parser.parse_args()
    if args.password == args.temporary_password:
        parser.error("temporary password must differ from the original password")

    client = Client(args.gateway_url, args.mailpit_url)
    original = login(client, args.email, args.password, "Recovery smoke original")
    existing = client.request("GET", "/api/v1/auth/sessions", token=original["accessToken"])
    assert any(session["active"] for session in existing), "Login did not create an active session"
    print(f"  login + session listing: {len(existing)} session(s)")

    before = message_ids(client)
    client.request("POST", "/api/v1/auth/forgot-password", {"email": args.email})
    token = wait_for_reset_token(client, args.email, before, args.reuse_latest_reset)
    print("  password-reset email: delivered through Mailpit")

    client.request("POST", "/api/v1/auth/reset-password", {
        "token": token,
        "newPassword": args.temporary_password,
    })
    expect_login_rejected(client, args.email, args.password)
    temporary = login(client, args.email, args.temporary_password, "Recovery smoke temporary")
    sessions = client.request("GET", "/api/v1/auth/sessions", token=temporary["accessToken"])
    assert sum(1 for session in sessions if session["active"]) == 1, "Reset did not revoke every older session"
    print("  password reset: old password rejected and older sessions revoked")

    client.request("POST", "/api/v1/auth/change-password", {
        "currentPassword": args.temporary_password,
        "newPassword": args.password,
    }, token=temporary["accessToken"])
    restored = login(client, args.email, args.password, "Recovery smoke restored")
    client.request("POST", "/api/v1/auth/logout", {"refreshToken": restored["refreshToken"]})
    print("  password change + logout: original demo credential restored")
    print("Auth recovery smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
