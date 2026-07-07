#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from urllib.parse import urlparse


ALLOWED_HOSTS = {
    "preview.krabiclaw.com",
    "staging.krabiclaw.com",
    "localhost",
    "127.0.0.1",
    "::1",
}

TARGET_KEYS = {
    "base_url",
    "baseurl",
    "domain",
    "endpoint",
    "host",
    "hostname",
    "href",
    "origin",
    "site_url",
    "url",
    "uri",
}

URL_RE = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)
HOST_RE = re.compile(r"(?<![@\w.-])(?:[a-z0-9-]+\.)*krabiclaw\.com(?::\d+)?(?![\w.-])", re.IGNORECASE)


def normalize_host(candidate: str) -> str:
    text = candidate.strip().strip("\"'`()[]{}<>,;")
    if not text:
        return ""

    parsed = urlparse(text if "://" in text else f"//{text}")
    host = parsed.hostname or ""
    return host.lower().rstrip(".")


def is_allowed_host(host: str) -> bool:
    if host in ALLOWED_HOSTS:
        return True
    if host.endswith(".localhost"):
        return True
    return False


def is_blocked_host(host: str) -> bool:
    if not host:
        return False
    if is_allowed_host(host):
        return False
    return host == "krabiclaw.com" or host.endswith(".krabiclaw.com")


def first_blocked_host_in_text(text: str) -> str | None:
    for match in URL_RE.finditer(text):
        host = normalize_host(match.group(0))
        if is_blocked_host(host):
            return host

    for match in HOST_RE.finditer(text):
        host = normalize_host(match.group(0))
        if is_blocked_host(host):
            return host

    return None


def find_blocked_host(value, key_path: tuple[str, ...] = ()) -> str | None:
    if isinstance(value, dict):
        for key, nested in value.items():
            blocked = find_blocked_host(nested, key_path + (str(key).lower(),))
            if blocked:
                return blocked
        return None

    if isinstance(value, list):
        for nested in value:
            blocked = find_blocked_host(nested, key_path)
            if blocked:
                return blocked
        return None

    if not isinstance(value, str):
        return None

    if "command" in key_path:
        return first_blocked_host_in_text(value)

    current_key = key_path[-1] if key_path else ""
    if current_key in TARGET_KEYS:
        host = normalize_host(value)
        if is_blocked_host(host):
            return host

    if value.startswith(("http://", "https://")):
        return first_blocked_host_in_text(value)

    return None


def deny(message: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": message,
                }
            }
        )
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    tool_name = str(payload.get("tool_name") or "")
    if tool_name == "apply_patch":
        return 0

    blocked_host = find_blocked_host(payload.get("tool_input"))
    if not blocked_host:
        return 0

    deny(
        "Blocked: this tool call targets production "
        f"{blocked_host}. Use localhost, preview.krabiclaw.com, or staging.krabiclaw.com instead."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
