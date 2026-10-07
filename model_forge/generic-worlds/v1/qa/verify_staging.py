#!/usr/bin/env python3
"""Verify a staged world ZIP against its embedded exact-byte asset manifest.

Verification only: no extraction, network, runtime resolver, or asset acceptance.
The root artifact-manifest.json excludes itself from its files[] hash inventory.
Dependencies: Python standard library only. See staging-format.md.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import sys
import unicodedata
import zipfile

MANIFEST_NAME = "artifact-manifest.json"
SCHEMA = "urai-generic-world-staging-verification-v1"
FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
ALLOWED_SUFFIXES = {".glb", ".gltf", ".bin", ".json", ".png", ".jpg", ".jpeg", ".webp", ".wav", ".ogg", ".mp3", ".ktx2", ".md", ".txt", ".pdf", ".svg"}
ALLOWED_EXTENSIONLESS = {"LICENSE", "NOTICE"}
WINDOWS_DEVICE = re.compile(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", re.I)


class StagingError(Exception):
    def __init__(self, code, path, message):
        self.code, self.path, self.message = code, path, message


def require(condition, code, path, message):
    if not condition:
        raise StagingError(code, path, message)


def safe_path(value):
    require(isinstance(value, str) and bool(value), "PATH", "$", "Expected a nonempty path string")
    require(not any(ord(c) < 32 or ord(c) == 127 for c in value), "PATH_CONTROL", value, "Control characters are forbidden")
    require("\\" not in value and ":" not in value, "PATH_PLATFORM_ESCAPE", value, "Backslashes and drive/stream colons are forbidden")
    require(not value.startswith("/") and not value.endswith("/"), "PATH_ABSOLUTE_OR_DIRECTORY", value, "Only relative file paths are allowed")
    parts = value.split("/")
    require(all(part not in ("", ".", "..") for part in parts), "PATH_TRAVERSAL", value, "Empty, dot, or parent components are forbidden")
    require(unicodedata.normalize("NFC", value) == value, "PATH_UNICODE", value, "Paths must use canonical NFC Unicode")
    require(all(not part.endswith((".", " ")) and not part.startswith(" ") and not WINDOWS_DEVICE.match(part) for part in parts),
            "PATH_PLATFORM_ALIAS", value, "Path has a platform-ambiguous or reserved component")
    require(not any(part.lower() in (".git", ".svn", "node_modules", "__pycache__") for part in parts), "SOURCE_TREE", value, "Repository/runtime source trees are forbidden")
    suffix = PurePosixPath(value).suffix.lower()
    require(suffix in ALLOWED_SUFFIXES or parts[-1] in ALLOWED_EXTENSIONLESS, "SOURCE_OR_UNSUPPORTED_FILE", value,
            "Only governed asset/data/document types are allowed; executable/build/QA source is excluded")
    return value


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "MANIFEST_DUPLICATE_KEY", "$." + key, "Duplicate JSON object key")
        result[key] = value
    return result


def reject_constant(value):
    raise StagingError("MANIFEST_JSON", "$", f"Nonstandard JSON constant {value}")


def sha_file(handle):
    handle.seek(0)
    digest = hashlib.sha256()
    while chunk := handle.read(1024 * 1024):
        digest.update(chunk)
    return digest.hexdigest()


def verify_zip_boundary(handle, infos, archive_bytes):
    require(bool(infos) and min(info.header_offset for info in infos) == 0,
            "ARCHIVE_PREFIX_DATA", "$", "ZIP must start at its first local file header, with no executable/prefix data")
    handle.seek(0)
    require(handle.read(4) == b"PK\x03\x04", "ARCHIVE_PREFIX_DATA", "$", "ZIP must start with a local file header")
    tail_start = max(0, archive_bytes - 65557)
    handle.seek(tail_start)
    tail = handle.read()
    offset = tail.rfind(b"PK\x05\x06")
    matched = None
    while offset >= 0:
        if offset + 22 <= len(tail):
            record = struct.unpack_from("<4s4H2IH", tail, offset)
            if offset + 22 + record[-1] == len(tail):
                matched = record
                break
        offset = tail.rfind(b"PK\x05\x06", 0, offset)
    require(matched is not None, "ARCHIVE_TRAILING_DATA", "$", "EOCD must end at EOF; trailing unlisted bytes are forbidden")
    require(matched[1] == 0 and matched[2] == 0, "MULTIPART_ARCHIVE", "$", "Split/multipart archives are unsupported")


def verify_archive(archive_path: Path, *, expected_sha256: str | None = None,
                   expected_version: str | None = None, require_deterministic: bool = True,
                   max_total_bytes: int = 4_000_000_000, max_file_bytes: int = 1_000_000_000,
                   max_manifest_bytes: int = 16_000_000, max_members: int = 100_000) -> dict:
    archive_path = Path(archive_path)
    findings, verified, manifest, digest, manifest_digest = [], [], {}, None, None
    metadata, archive_bytes, declared_total = [], 0, 0
    deterministic = False
    try:
        if expected_sha256 is not None:
            require(bool(re.fullmatch(r"[0-9a-f]{64}", expected_sha256)), "EXPECTED_ARCHIVE_HASH", "$", "Expected SHA-256 must be lowercase hexadecimal")
        if expected_version is not None:
            require(bool(re.fullmatch(r"\d+\.\d+\.\d+", expected_version)), "EXPECTED_VERSION", "$", "Expected version must be semantic")
        with archive_path.open("rb") as source:
            archive_bytes = source.seek(0, 2)
            initial_digest = sha_file(source)
            digest = initial_digest
            with zipfile.ZipFile(source, "r") as archive:
                infos = archive.infolist()
                require(0 < len(infos) <= max_members, "MEMBER_BUDGET", "$", f"ZIP member count must be 1..{max_members}")
                verify_zip_boundary(source, infos, archive_bytes)
                members, folded = {}, set()
                for info in infos:
                    safe_path(info.orig_filename)
                    name = safe_path(info.filename)
                    require(name not in members and name.casefold() not in folded, "DUPLICATE_MEMBER", name, "Duplicate or case-aliased ZIP member")
                    members[name] = info
                    folded.add(name.casefold())
                    require(not info.is_dir(), "DIRECTORY_MEMBER", name, "ZIP contains files only; omit directory entries")
                    mode = info.external_attr >> 16
                    require(stat.S_IFMT(mode) in (0, stat.S_IFREG), "SPECIAL_MEMBER", name, "Symlinks/devices/nonregular members are forbidden")
                    require(not info.flag_bits & (1 | 64), "ENCRYPTED_MEMBER", name, "Encrypted members are forbidden")
                    require(info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "COMPRESSION", name, "Only stored/deflated ZIP members are supported")
                    require(0 <= info.file_size <= max_file_bytes, "FILE_BUDGET", name, f"Member exceeds {max_file_bytes} uncompressed bytes")
                    declared_total += info.file_size
                    require(declared_total <= max_total_bytes, "TOTAL_BUDGET", "$", f"ZIP exceeds {max_total_bytes} uncompressed bytes")
                    metadata.append({"path": name, "timestamp": list(info.date_time), "unixMode": oct(mode),
                                     "createSystem": info.create_system, "compression": info.compress_type,
                                     "extraBytes": len(info.extra), "commentBytes": len(info.comment)})
                require(MANIFEST_NAME in members, "MANIFEST_MISSING", "$", f"Missing root {MANIFEST_NAME}")
                require(members[MANIFEST_NAME].file_size <= max_manifest_bytes, "MANIFEST_BUDGET", MANIFEST_NAME, "Manifest exceeds parsing budget")
                raw_manifest = archive.read(members[MANIFEST_NAME])
                manifest_digest = hashlib.sha256(raw_manifest).hexdigest()
                manifest = json.loads(raw_manifest.decode("utf-8"), object_pairs_hook=unique_object, parse_constant=reject_constant)
                require(isinstance(manifest, dict), "MANIFEST_SCHEMA", "$", "Manifest must be an object")
                require(type(manifest.get("schemaVersion")) is int and manifest["schemaVersion"] == 1, "MANIFEST_SCHEMA", "$.schemaVersion", "Expected schemaVersion 1")
                require(manifest.get("truthClassification") == "GENERIC", "TRUTH_CLASSIFICATION", "$.truthClassification", "Archive must retain GENERIC classification")
                version = manifest.get("currentVersion")
                require(isinstance(version, str) and bool(re.fullmatch(r"\d+\.\d+\.\d+", version)), "CURRENT_VERSION", "$.currentVersion", "Expected semantic currentVersion")
                require(expected_version is None or version == expected_version, "VERSION_MISMATCH", "$.currentVersion", "Declared currentVersion does not match expected version")
                records = manifest.get("files")
                require(isinstance(records, list) and records, "MANIFEST_FILES", "$.files", "files[] must be a nonempty inventory")
                declared, manifest_folded = {}, set()
                for index, record in enumerate(records):
                    require(isinstance(record, dict), "MANIFEST_RECORD", f"$.files[{index}]", "File record must be an object")
                    name = safe_path(record.get("path"))
                    require(name != MANIFEST_NAME, "MANIFEST_SELF_REFERENCE", name, "Root manifest excludes itself from files[]")
                    require(name not in declared and name.casefold() not in manifest_folded, "DUPLICATE_MANIFEST_PATH", name, "Manifest paths must be unique")
                    require(type(record.get("bytes")) is int and record["bytes"] >= 0, "MANIFEST_SIZE", name, "bytes must be a nonnegative integer")
                    require(isinstance(record.get("sha256"), str) and bool(re.fullmatch(r"[0-9a-f]{64}", record["sha256"])), "MANIFEST_HASH", name, "Expected lowercase SHA-256")
                    declared[name] = record
                    manifest_folded.add(name.casefold())
                actual = set(members) - {MANIFEST_NAME}
                require(not set(declared) - actual, "MISSING_FILES", "$", f"Missing manifest files: {sorted(set(declared) - actual)}")
                require(not actual - set(declared), "UNEXPECTED_FILES", "$", f"Unlisted ZIP files: {sorted(actual - set(declared))}")
                for namespace in ("packages", "kits"):
                    require(any(name.startswith(namespace + "/") and f"/{version}/" in name and name.endswith(".glb") for name in declared),
                            "CURRENT_ASSETS_MISSING", namespace, f"No currentVersion {version} GLB is present in {namespace}/")
                deterministic = (archive.comment == b"" and list(members) == sorted(members) and
                                 list(declared) == sorted(declared) and all(
                                     info.date_time == FIXED_TIMESTAMP and info.extra == b"" and info.comment == b"" and
                                     info.create_system == 3 and info.internal_attr == 0 and
                                     info.external_attr == (stat.S_IFREG | 0o644) << 16 for info in infos))
                require(not require_deterministic or deterministic, "NONDETERMINISTIC_METADATA", "$",
                        "Expected sorted members/inventory, 1980 timestamp, Unix regular0644, empty extra/comments")
                for name, record in declared.items():
                    info = members[name]
                    require(info.file_size == record["bytes"], "SIZE_MISMATCH", name, "ZIP uncompressed size differs from manifest")
                    checksum, read_bytes = hashlib.sha256(), 0
                    with archive.open(info, "r") as member:
                        while chunk := member.read(1024 * 1024):
                            checksum.update(chunk)
                            read_bytes += len(chunk)
                            require(read_bytes <= record["bytes"] and read_bytes <= max_file_bytes, "DECOMPRESSED_SIZE", name, "Member exceeds declared byte count")
                    require(read_bytes == record["bytes"], "SIZE_MISMATCH", name, "Actual decompressed byte count differs from manifest")
                    actual_hash = checksum.hexdigest()
                    require(actual_hash == record["sha256"], "HASH_MISMATCH", name, "Exact member SHA-256 differs from manifest")
                    verified.append({"path": name, "bytes": read_bytes, "sha256": actual_hash})
            digest = sha_file(source)
            require(digest == initial_digest, "ARCHIVE_CHANGED_DURING_VERIFICATION", "$", "Archive bytes changed during verification")
            require(expected_sha256 is None or digest == expected_sha256, "ARCHIVE_HASH_MISMATCH", "$", "ZIP SHA-256 differs from expected archive hash")
    except StagingError as error:
        findings.append({"severity": "ERROR", "code": error.code, "path": error.path, "message": error.message})
    except (OSError, zipfile.BadZipFile, UnicodeDecodeError, ValueError, TypeError, KeyError, RuntimeError, NotImplementedError) as error:
        findings.append({"severity": "ERROR", "code": "UNREADABLE_ARCHIVE_OR_MANIFEST", "path": "$", "message": f"{type(error).__name__}: {error}"})
    passed = not findings
    return {"schemaVersion": SCHEMA, "verifiedAt": datetime.now(timezone.utc).isoformat(),
            "verifierSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "archive": str(archive_path),
            "archiveSha256": digest, "archiveBytes": archive_bytes, "manifestSha256": manifest_digest,
            "expectedArchiveSha256": expected_sha256, "expectedVersion": expected_version,
            "currentVersion": manifest.get("currentVersion") if isinstance(manifest, dict) else None,
            "truthClassification": manifest.get("truthClassification") if isinstance(manifest, dict) else None,
            "passed": passed, "verdict": "STAGED_ARCHIVE_EXACT_BYTES_VERIFIED" if passed else "NEEDS_REWORK",
            "findings": findings, "verifiedFileCount": len(verified), "verifiedFiles": verified,
            "declaredUncompressedBytesIncludingManifest": declared_total, "deterministicMetadataProfile": deterministic,
            "zipMetadata": metadata,
            "evidenceBoundary": {"archiveContents": "VERIFIED_FROM_LOCAL_ZIP_BYTES" if passed else "INCOMPLETE_OR_REJECTED",
                                 "gitBinaryAvailability": "NOT_ASSERTED", "externalAvailability": "NOT_VERIFIED",
                                 "runtimeResolution": "NOT_CHANGED", "geometryVisualQuality": "NOT_EVALUATED",
                                 "runtimeIntegration": "NOT_GRANTED", "releaseAcceptance": "NOT_GRANTED",
                                 "independentApproval": "NOT_GRANTED", "crossPlatformRebuildReproducibility": "NOT_PROVEN_BY_HEADER_CHECKS"}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--expected-version")
    parser.add_argument("--allow-nondeterministic", action="store_true", help="Report rather than require the deterministic header profile")
    parser.add_argument("--max-total-bytes", type=int, default=4_000_000_000)
    parser.add_argument("--max-file-bytes", type=int, default=1_000_000_000)
    args = parser.parse_args(argv)
    if min(args.max_total_bytes, args.max_file_bytes) < 1:
        parser.error("Byte budgets must be positive")
    if args.report and args.report.exists():
        parser.error("Receipt already exists; choose a versioned successor")
    report = verify_archive(args.archive, expected_sha256=args.expected_sha256, expected_version=args.expected_version,
                            require_deterministic=not args.allow_nondeterministic,
                            max_total_bytes=args.max_total_bytes, max_file_bytes=args.max_file_bytes)
    output = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    print(output, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
