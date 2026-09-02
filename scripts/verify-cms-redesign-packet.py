#!/usr/bin/env python3
"""Verifies docs/design/cms-redesign-packet/AUDIT.tsv against the actual packet on disk.

Exits 0 only if every check passes. Exits 1 and prints every failing row otherwise.
This is a completeness/consistency gate, not a judgment of whether the packet's
screenshot content is "good" — a clean exit means the manifest is internally
consistent and matches disk, not that there is nothing left to capture.
"""
import csv
import hashlib
import re
import subprocess
import sys
from pathlib import Path

PACKET_ROOT = Path(__file__).resolve().parent.parent / "docs" / "design" / "cms-redesign-packet"
AUDIT_PATH = PACKET_ROOT / "AUDIT.tsv"
COLUMNS = [
    "scope", "route_or_state", "parent_screen", "trigger", "expected_result",
    "status", "screenshot", "environment", "browser_viewport",
    "stored_image_dimensions", "exclusion_reason", "blocker", "validation",
]
VALID_STATUSES = {"captured", "excluded", "redirect-only", "not-applicable", "blocked"}


def fail(msg: str, failures: list[str]) -> None:
    failures.append(msg)


def load_manifest() -> list[dict]:
    if not AUDIT_PATH.exists():
        print(f"FATAL: {AUDIT_PATH} does not exist.")
        sys.exit(1)
    with open(AUDIT_PATH, newline="") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        if reader.fieldnames != COLUMNS:
            print(f"FATAL: AUDIT.tsv header mismatch.\n  expected: {COLUMNS}\n  got:      {reader.fieldnames}")
            sys.exit(1)
        return list(reader)


def identify(path: Path) -> str | None:
    try:
        out = subprocess.run(
            ["identify", "-format", "%wx%h", str(path)],
            capture_output=True, text=True, timeout=10,
        )
    except FileNotFoundError:
        print("FATAL: `identify` (ImageMagick) not found on PATH.")
        sys.exit(1)
    if out.returncode != 0:
        return None
    return out.stdout.strip()


def md5_of(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    failures: list[str] = []
    rows = load_manifest()

    manifest_screenshots: dict[str, dict] = {}
    for i, row in enumerate(rows, start=2):  # +2: header is line 1, data starts at 2
        status = row["status"].strip()
        screenshot = row["screenshot"].strip()

        if status not in VALID_STATUSES:
            fail(f"line {i}: unknown status {status!r} (route: {row['route_or_state']})", failures)

        if status == "captured":
            if not screenshot:
                fail(f"line {i}: status=captured but screenshot column is empty (route: {row['route_or_state']})", failures)
                continue
            manifest_screenshots[screenshot] = row
        else:
            if screenshot:
                fail(f"line {i}: status={status} but screenshot column is non-empty ({screenshot}) — a non-captured row should not claim a file", failures)

        if status in {"excluded", "not-applicable"} and not row["exclusion_reason"].strip():
            fail(f"line {i}: status={status} requires a non-empty exclusion_reason (route: {row['route_or_state']})", failures)

        if status == "blocked" and not row["blocker"].strip():
            fail(f"line {i}: status=blocked requires a non-empty blocker (route: {row['route_or_state']})", failures)

    # ---- Cross-check every manifest screenshot exists, decodes, and matches recorded dimensions ----
    hashes: dict[str, list[str]] = {}
    for screenshot, row in manifest_screenshots.items():
        path = PACKET_ROOT / screenshot
        if not path.exists():
            fail(f"manifest row references missing file: {screenshot}", failures)
            continue
        actual_dims = identify(path)
        if actual_dims is None:
            fail(f"file does not decode as an image: {screenshot}", failures)
            continue
        recorded_dims = row["stored_image_dimensions"].strip()
        if recorded_dims != actual_dims:
            fail(f"{screenshot}: manifest says stored_image_dimensions={recorded_dims!r}, actual is {actual_dims!r}", failures)
            row["validation"] = "FAIL:dimension-mismatch"
        else:
            row["validation"] = "ok"
        h = md5_of(path)
        hashes.setdefault(h, []).append(screenshot)

    # ---- Duplicate content ----
    for h, paths in hashes.items():
        if len(paths) > 1:
            fail(f"duplicate image content (md5 {h}) across: {', '.join(sorted(paths))}", failures)

    # ---- Every JPG on disk must be represented in the manifest ----
    on_disk = set()
    for sub in ("current", "goal"):
        for p in (PACKET_ROOT / sub).rglob("*.jpg"):
            on_disk.add(str(p.relative_to(PACKET_ROOT)))
    manifest_set = set(manifest_screenshots.keys())
    for extra in sorted(on_disk - manifest_set):
        fail(f"file on disk not represented in AUDIT.tsv: {extra}", failures)
    for missing in sorted(manifest_set - on_disk):
        fail(f"AUDIT.tsv references a file not found on disk: {missing}", failures)

    # ---- README paths resolve ----
    # READMEs use a documentation shorthand ("`.../locations/[loc]/foo.jpg`") that
    # elides a shared prefix already established earlier in the same table — it is
    # not meant to be a literal resolvable path on its own. We verify it the way a
    # human reader would: does some real file on disk end with this suffix. A bare
    # "index.jpg" with no path segments is a generic convention example, not a
    # pointer to one specific file, and is skipped.
    on_disk_list = sorted(on_disk)
    for readme in (PACKET_ROOT / "README.md", PACKET_ROOT / "current" / "README.md", PACKET_ROOT / "goal" / "README.md"):
        if not readme.exists():
            fail(f"expected README missing: {readme.relative_to(PACKET_ROOT)}", failures)
            continue
        text = readme.read_text()
        for m in re.finditer(r"`([^`]+\.jpg)`", text):
            ref = m.group(1)
            if ref == "index.jpg":
                continue
            suffix = ref.lstrip(".").lstrip("/")
            if not any(p.endswith(suffix) for p in on_disk_list):
                fail(f"{readme.relative_to(PACKET_ROOT)} references a .jpg path with no matching file on disk (by suffix): {ref}", failures)

    # ---- A clean pass requires zero rows left in an unresolved state. "blocked" is a
    # legitimate, disclosed status for reporting purposes, but per the acceptance
    # criteria this script enforces, its mere presence fails the gate — the packet
    # is not done while anything is blocked, no matter how well-documented.
    blocked_rows = [r for r in rows if r["status"].strip() == "blocked"]
    for row in blocked_rows:
        fail(f"unresolved blocked row: {row['route_or_state']} (blocker: {row['blocker']})", failures)

    # ---- Report ----
    print(f"Checked {len(rows)} manifest rows, {len(manifest_screenshots)} captured screenshots, {len(on_disk)} files on disk.")
    if failures:
        print(f"\n{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  - {f}")
        print("\nRESULT: FAIL")
        return 1

    # This is a check, not a mutator: only touch AUDIT.tsv once every check above has
    # actually passed, so a failing run never leaves the working tree dirty and two
    # runs of a failing manifest always produce identical output.
    with open(AUDIT_PATH, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS, delimiter="\t")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print("\nRESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
