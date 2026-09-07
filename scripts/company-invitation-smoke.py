#!/usr/bin/env python3
"""Verify company invitation and member-role lifecycle through public APIs."""

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
        headers = {"Accept": "application/json", "User-Agent": "smart-recruitment-company-smoke/1.0",
                   "X-Correlation-Id": str(uuid4())}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(f"{self.mailpit if mailpit else self.gateway}{path}",
                          data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as error:
            raise ApiError(error.code, error.read().decode(errors="replace")) from error
        return json.loads(raw) if raw else None


def login(client: Client, email: str, password: str, device: str) -> dict[str, Any]:
    return client.request("POST", "/api/v1/auth/login", {"email": email, "password": password,
                          "clientType": "WEB", "deviceName": device})


def mail_ids(client: Client) -> set[str]:
    return {str(value["ID"]) for value in client.request("GET", "/api/v1/messages", mailpit=True)["messages"]}


def wait_mail_token(client: Client, email: str, subject_word: str,
                    previous_ids: set[str], allow_existing: bool = False) -> str:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        messages = client.request("GET", "/api/v1/messages", mailpit=True)["messages"]
        for message in messages:
            if not allow_existing and str(message["ID"]) in previous_ids:
                continue
            recipients = {value.get("Address", "").casefold() for value in message.get("To", [])}
            if email.casefold() not in recipients or subject_word.casefold() not in message.get("Subject", "").casefold():
                continue
            detail = client.request("GET", f"/api/v1/message/{message['ID']}", mailpit=True)
            match = re.search(r"token=([0-9a-f]{64})", f"{detail.get('Text', '')}\n{detail.get('HTML', '')}")
            if match:
                return match.group(1)
        time.sleep(1)
    raise TimeoutError(f"No {subject_word} email arrived for {email}")


def ensure_recruiter(client: Client, email: str, password: str) -> dict[str, Any]:
    try:
        return login(client, email, password, "Invited recruiter smoke")
    except ApiError as error:
        if error.status != 401:
            raise
    before = mail_ids(client)
    try:
        client.request("POST", "/api/v1/auth/register",
                       {"email": email, "password": password, "accountType": "RECRUITER"})
    except ApiError as error:
        if error.status != 409:
            raise
    verification = wait_mail_token(client, email, "verify", before, allow_existing=True)
    try:
        client.request("POST", "/api/v1/auth/verify-email", {"token": verification})
    except ApiError as error:
        if error.status != 409:
            raise
    return login(client, email, password, "Invited recruiter smoke")


def update_member(client: Client, company_id: str, member: dict[str, Any], owner_token: str,
                  role: str, status: str) -> dict[str, Any]:
    return client.request("PATCH", f"/api/v1/companies/{company_id}/members/{member['memberId']}",
                          {"role": role, "status": status, "version": member["version"]}, owner_token)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gateway-url", default="http://localhost:8080")
    parser.add_argument("--mailpit-url", default="http://localhost:8025")
    parser.add_argument("--owner-email", default="recruiter.demo@smart.local")
    parser.add_argument("--owner-password", default="DemoRecruiter!2026")
    parser.add_argument("--invitee-email", default="invited.recruiter.demo@smart.local")
    parser.add_argument("--invitee-password", default="DemoInvitedRecruiter!2026")
    parser.add_argument("--company-slug", default="smart-recruitment-demo")
    args = parser.parse_args()

    client = Client(args.gateway_url, args.mailpit_url)
    owner = login(client, args.owner_email, args.owner_password, "Company invitation owner")
    invitee = ensure_recruiter(client, args.invitee_email, args.invitee_password)
    companies = client.request("GET", "/api/v1/companies", token=owner["accessToken"])
    company = next(value for value in companies if value["slug"] == args.company_slug)
    company_id = company["companyId"]
    members = client.request("GET", f"/api/v1/companies/{company_id}/members", token=owner["accessToken"])
    member = next((value for value in members if value["userId"] == invitee["userId"] and value["status"] != "LEFT"), None)

    if member is None:
        before = mail_ids(client)
        reuse = False
        try:
            client.request("POST", f"/api/v1/companies/{company_id}/invitations",
                           {"email": args.invitee_email, "role": "VIEWER"}, owner["accessToken"])
        except ApiError as error:
            if error.status != 409:
                raise
            reuse = True
        invitation_token = wait_mail_token(client, args.invitee_email, "invitation", before, allow_existing=reuse)
        member = client.request("POST", "/api/v1/companies/invitations/accept",
                                {"token": invitation_token}, invitee["accessToken"])
        print("  invitation email + matching JWT email acceptance: passed")
    else:
        print("  invitation membership already exists: reusing idempotent demo member")

    member = update_member(client, company_id, member, owner["accessToken"], "RECRUITER", "SUSPENDED")
    member = update_member(client, company_id, member, owner["accessToken"], "RECRUITER", "ACTIVE")
    print("  optimistic member role/status lifecycle: VIEWER → RECRUITER/SUSPENDED → ACTIVE")

    owner_member = next(value for value in members if value["role"] == "OWNER")
    try:
        update_member(client, company_id, owner_member, owner["accessToken"], "VIEWER", "SUSPENDED")
    except ApiError as error:
        if error.status != 409:
            raise
    else:
        raise AssertionError("Owner protection did not reject role/status change")
    print("  owner immutability: protected with HTTP 409")

    invitee_companies = client.request("GET", "/api/v1/companies", token=invitee["accessToken"])
    assert any(value["companyId"] == company_id for value in invitee_companies)
    print("  invited recruiter company visibility: passed")
    print("Company invitation smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
