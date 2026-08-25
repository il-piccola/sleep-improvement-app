#!/usr/bin/env python3
"""O-12e Firestore read-only preservation collector.

Reads the six known Sleep Compass collection groups once, writes no Firestore data,
prints no document contents, and archives every present document into a private
Cloud Shell bundle for later N100 + Google Drive preservation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

EVIDENCE_VERSION = "2"
DATABASE = "(default)"
COLLECTIONS = [
    "sleep_records",
    "health_metric_records",
    "processed_drive_files",
    "drive_sync_runs",
    "ingest_batches",
    "metric_audit_summaries",
]
USER_PATH_RE = re.compile(r"/documents/users/([^/]+)/")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="sleep-improvement-cloud")
    parser.add_argument("--output-dir", default=str(Path.home() / "o12e-firestore-evidence"))
    return parser.parse_args()


def access_token() -> str:
    return subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()


def run_collection_group(project: str, token: str, collection: str) -> list[dict[str, Any]]:
    url = (
        f"https://firestore.googleapis.com/v1/projects/{project}/databases/"
        f"{DATABASE}/documents:runQuery"
    )
    body = {
        "structuredQuery": {
            "from": [{"collectionId": collection, "allDescendants": True}],
            "orderBy": [
                {"field": {"fieldPath": "__name__"}, "direction": "ASCENDING"}
            ],
        }
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(body, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.load(response)
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected Firestore response for {collection}")
    return [item["document"] for item in payload if isinstance(item, dict) and "document" in item]


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def user_roots(documents_by_collection: dict[str, list[dict[str, Any]]]) -> set[str]:
    roots: set[str] = set()
    for documents in documents_by_collection.values():
        for document in documents:
            name = str(document.get("name", ""))
            match = USER_PATH_RE.search(name)
            if match:
                roots.add(match.group(1))
    return roots


def filter_user_documents(
    documents_by_collection: dict[str, list[dict[str, Any]]], user_root: str | None
) -> dict[str, list[dict[str, Any]]]:
    if user_root is None:
        return documents_by_collection
    marker = f"/documents/users/{user_root}/"
    return {
        collection: [document for document in documents if marker in str(document.get("name", ""))]
        for collection, documents in documents_by_collection.items()
    }


def write_archive(root: Path, collection: str, documents: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not documents:
        return None
    archive_dir = root / "firestore-archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    path = archive_dir / f"{collection}.jsonl"
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for document in documents:
            handle.write(stable_json(document))
            handle.write("\n")
    data = path.read_bytes()
    return {
        "relativePath": f"firestore-archive/{collection}.jsonl",
        "byteLength": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def source_entry(
    collection: str,
    documents: list[dict[str, Any]],
    root: Path,
) -> dict[str, Any]:
    count = len(documents)
    artifact = write_archive(root, collection, documents)
    entry: dict[str, Any] = {
        "sourceSystem": "firestore",
        "dataset": collection,
        "classification": "archive",
        "presence": "present" if count else "absent",
        "sourceCount": count,
    }
    if artifact:
        entry["archiveArtifact"] = artifact
    return entry


def create_zip(root: Path) -> tuple[Path, str]:
    zip_path = root.with_suffix(".zip")
    if zip_path.exists():
        raise RuntimeError(f"Refusing to overwrite existing bundle: {zip_path}")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(root))
    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    return zip_path, digest


def main() -> int:
    args = parse_args()
    root = Path(args.output_dir).expanduser().resolve()
    if root.exists():
        print(f"BLOCKED: output directory already exists: {root}", file=sys.stderr)
        return 2
    root.mkdir(parents=True)

    try:
        token = access_token()
        documents_by_collection = {
            collection: run_collection_group(args.project, token, collection)
            for collection in COLLECTIONS
        }
        roots = user_roots(documents_by_collection)
        if len(roots) > 1:
            print(f"BLOCKED: multiple user roots detected: {len(roots)}", file=sys.stderr)
            shutil.rmtree(root, ignore_errors=True)
            return 3

        selected_user = next(iter(roots)) if roots else None
        selected = filter_user_documents(documents_by_collection, selected_user)
        evidence = {
            "evidenceVersion": EVIDENCE_VERSION,
            "generatedAt": subprocess.check_output(
                ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True
            ).strip(),
            "sources": [source_entry(collection, selected[collection], root) for collection in COLLECTIONS],
        }
        evidence_path = root / "o12e-firestore-evidence.json"
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        zip_path, zip_sha = create_zip(root)

        print("O-12e Firestore preservation: PASS")
        print(f"project: {args.project}")
        print(f"user roots: {len(roots)}")
        for collection in COLLECTIONS:
            print(f"{collection}: {len(selected[collection])}")
        print(f"evidence file: {evidence_path}")
        print(f"bundle: {zip_path}")
        print(f"bundle sha256: {zip_sha}")
        print("Firestore writes/updates/deletes: 0")
        return 0
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        shutil.rmtree(root, ignore_errors=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
