#!/usr/bin/env python3
"""O-12e Firestore read-only evidence/archive collector.

Reads the six known Sleep Compass collection groups once, writes no Firestore data,
prints no document contents, and creates a private local Cloud Shell evidence bundle.
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

EVIDENCE_VERSION = "1"
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


def decode_firestore_value(value: Any) -> Any:
    if not isinstance(value, dict):
        return None
    if "nullValue" in value:
        return None
    if "booleanValue" in value:
        return bool(value["booleanValue"])
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return normalize_number(float(value["doubleValue"]))
    if "stringValue" in value:
        return value["stringValue"]
    if "timestampValue" in value:
        return value["timestampValue"]
    if "bytesValue" in value:
        return value["bytesValue"]
    if "referenceValue" in value:
        return value["referenceValue"]
    if "geoPointValue" in value:
        return value["geoPointValue"]
    if "arrayValue" in value:
        return [decode_firestore_value(item) for item in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {
            key: decode_firestore_value(item)
            for key, item in value["mapValue"].get("fields", {}).items()
        }
    return None


def decode_fields(document: dict[str, Any]) -> dict[str, Any]:
    fields = document.get("fields", {})
    if not isinstance(fields, dict):
        return {}
    return {key: decode_firestore_value(value) for key, value in fields.items()}


def normalize_number(value: float) -> int | float:
    if value == 0:
        return 0
    return int(value) if value.is_integer() else value


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def semantic_hash(records: list[dict[str, Any]], projection) -> str:
    lines = sorted(stable_json(projection(decode_fields(document))) for document in records)
    body = "" if not lines else "\n".join(lines) + "\n"
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def sleep_projection(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "durationMinutes": value.get("durationMinutes"),
        "end": value.get("end"),
        "originalValue": value.get("originalValue"),
        "sourceFormat": value.get("sourceFormat"),
        "sourceKey": value.get("sourceKey"),
        "stage": value.get("stage"),
        "start": value.get("start"),
    }


def health_projection(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "aggregation": value.get("aggregation"),
        "date": value.get("date"),
        "granularity": value.get("granularity"),
        "metricGroup": value.get("metricGroup"),
        "metricName": value.get("metricName"),
        "sourceKey": value.get("sourceKey"),
        "unit": value.get("unit"),
        "value": value.get("value"),
        "valueAvg": value.get("valueAvg"),
        "valueCount": value.get("valueCount"),
        "valueMax": value.get("valueMax"),
        "valueMin": value.get("valueMin"),
        "windowEnd": value.get("windowEnd"),
        "windowStart": value.get("windowStart"),
    }


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
    presence = "present" if count else "absent"
    if collection == "sleep_records":
        return {
            "sourceSystem": "firestore",
            "dataset": collection,
            "classification": "rebuild",
            "presence": presence,
            "sourceCount": count,
            "semanticSha256": semantic_hash(documents, sleep_projection),
        }
    if collection == "health_metric_records":
        return {
            "sourceSystem": "firestore",
            "dataset": collection,
            "classification": "rebuild",
            "presence": presence,
            "sourceCount": count,
            "semanticSha256": semantic_hash(documents, health_projection),
        }

    artifact = write_archive(root, collection, documents)
    entry = {
        "sourceSystem": "firestore",
        "dataset": collection,
        "classification": "archive",
        "presence": presence,
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

        print("O-12e Firestore evidence: PASS")
        print(f"project: {args.project}")
        print(f"user roots: {len(roots)}")
        for collection in COLLECTIONS:
            print(f"{collection}: {len(selected[collection])}")
        print(f"evidence file: {evidence_path}")
        print(f"bundle: {zip_path}")
        print(f"bundle sha256: {zip_sha}")
        print("Firestore writes/deletes: 0")
        return 0
    except Exception as error:
        print(f"FAIL: {error}", file=sys.stderr)
        shutil.rmtree(root, ignore_errors=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
