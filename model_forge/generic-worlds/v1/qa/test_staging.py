"""Adversarial exact-byte ZIP staging tests, independent of scene production."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

from verify_staging import MANIFEST_NAME, verify_archive


class StagingArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        # Byte-integrity fixtures only; this verifier must not call them valid GLBs.
        self.payloads = {
            "packages/gw-test/1.0.2/lod0.glb": b"package bytes: geometry acceptance is a separate check",
            "kits/test-chair/1.0.2/lod0.glb": b"kit bytes: composition acceptance is a separate check",
            "receipts/example.json": b'{"runtimeIntegrated":false}',
        }
        self.manifest = {"schemaVersion": 1, "truthClassification": "GENERIC", "currentVersion": "1.0.2",
                         "files": [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                                   for name, data in sorted(self.payloads.items())]}

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, *, payloads=None, manifest=None, raw_manifest=None, duplicate=None,
                symlink=None, nondeterministic=False, include_manifest=True) -> Path:
        payloads = dict(self.payloads if payloads is None else payloads)
        manifest = self.manifest if manifest is None else manifest
        if include_manifest:
            payloads[MANIFEST_NAME] = raw_manifest if raw_manifest is not None else json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
        file = self.base / "artifact.zip"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_STORED) as target:
                for name, data in sorted(payloads.items()):
                    info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0) if nondeterministic else (1980, 1, 1, 0, 0, 0))
                    info.create_system = 3
                    info.external_attr = ((stat.S_IFLNK | 0o777) if name == symlink else (stat.S_IFREG | 0o644)) << 16
                    target.writestr(info, data)
                    if name == duplicate:
                        target.writestr(info, data)
        return file

    def reject(self, file: Path, code: str, **kwargs):
        report = verify_archive(file, **kwargs)
        self.assertFalse(report["passed"], report)
        self.assertIn(code, [f["code"] for f in report["findings"]], report)
        return report

    def test_valid_exact_manifest_and_deterministic_archive(self):
        file = self.archive()
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        report = verify_archive(file, expected_sha256=digest, expected_version="1.0.2")
        self.assertTrue(report["passed"], report)
        self.assertEqual(report["verifiedFileCount"], 3)
        self.assertEqual(report["archiveSha256"], digest)
        self.assertTrue(report["deterministicMetadataProfile"])
        self.assertEqual(report["evidenceBoundary"]["gitBinaryAvailability"], "NOT_ASSERTED")

    def test_member_bytes_changed_with_valid_zip_crc(self):
        payloads = dict(self.payloads)
        payloads["receipts/example.json"] = b'{"runtimeIntegrated":true }'
        self.reject(self.archive(payloads=payloads), "HASH_MISMATCH")

    def test_byte_count_mismatch(self):
        manifest = json.loads(json.dumps(self.manifest))
        manifest["files"][0]["bytes"] += 1
        self.reject(self.archive(manifest=manifest), "SIZE_MISMATCH")

    def test_missing_listed_file(self):
        payloads = dict(self.payloads)
        payloads.pop("receipts/example.json")
        self.reject(self.archive(payloads=payloads), "MISSING_FILES")

    def test_unexpected_unlisted_file(self):
        payloads = dict(self.payloads)
        payloads["receipts/unlisted.json"] = b"{}"
        self.reject(self.archive(payloads=payloads), "UNEXPECTED_FILES")

    def test_traversal_zip_member(self):
        payloads = dict(self.payloads)
        payloads["../outside.json"] = b"{}"
        self.reject(self.archive(payloads=payloads), "PATH_TRAVERSAL")

    def test_windows_backslash_escape(self):
        payloads = dict(self.payloads)
        payloads["packages\\..\\outside.json"] = b"{}"
        self.reject(self.archive(payloads=payloads), "PATH_PLATFORM_ESCAPE")

    def test_absolute_zip_member(self):
        payloads = dict(self.payloads)
        payloads["/absolute.json"] = b"{}"
        self.reject(self.archive(payloads=payloads), "PATH_ABSOLUTE_OR_DIRECTORY")

    def test_symlink_member(self):
        self.reject(self.archive(symlink="receipts/example.json"), "SPECIAL_MEMBER")

    def test_duplicate_zip_member(self):
        self.reject(self.archive(duplicate="receipts/example.json"), "DUPLICATE_MEMBER")

    def test_case_aliased_zip_members(self):
        payloads = dict(self.payloads)
        payloads["receipts/EXAMPLE.json"] = b"{}"
        self.reject(self.archive(payloads=payloads), "DUPLICATE_MEMBER")

    def test_duplicate_manifest_paths(self):
        manifest = json.loads(json.dumps(self.manifest))
        manifest["files"].append(dict(manifest["files"][0]))
        self.reject(self.archive(manifest=manifest), "DUPLICATE_MANIFEST_PATH")

    def test_manifest_cannot_list_itself(self):
        manifest = json.loads(json.dumps(self.manifest))
        manifest["files"].append({"path": MANIFEST_NAME, "bytes": 0, "sha256": "0" * 64})
        self.reject(self.archive(manifest=manifest), "MANIFEST_SELF_REFERENCE")

    def test_manifest_duplicate_json_key(self):
        raw = json.dumps(self.manifest).encode()
        raw = b'{"schemaVersion":1,' + raw[1:]
        self.reject(self.archive(raw_manifest=raw), "MANIFEST_DUPLICATE_KEY")

    def test_truth_label_must_remain_generic(self):
        manifest = json.loads(json.dumps(self.manifest))
        manifest["truthClassification"] = "RECORDED SOURCE TRUTH"
        self.reject(self.archive(manifest=manifest), "TRUTH_CLASSIFICATION")

    def test_bool_schema_is_not_integer_one(self):
        manifest = json.loads(json.dumps(self.manifest))
        manifest["schemaVersion"] = True
        self.reject(self.archive(manifest=manifest), "MANIFEST_SCHEMA")

    def test_no_build_or_qa_source_in_archive(self):
        payloads = dict(self.payloads)
        payloads["qa/validate.py"] = b"print('source code must stay in Git')"
        self.reject(self.archive(payloads=payloads), "SOURCE_OR_UNSUPPORTED_FILE")

    def test_prefix_executable_bytes_are_rejected(self):
        file = self.archive()
        file.write_bytes(b"MZ-hidden-executable" + file.read_bytes())
        self.reject(file, "ARCHIVE_PREFIX_DATA")

    def test_trailing_unlisted_bytes_are_rejected(self):
        file = self.archive()
        file.write_bytes(file.read_bytes() + b"hidden-after-zip")
        self.reject(file, "ARCHIVE_TRAILING_DATA")

    def test_crc_corruption(self):
        file = self.archive()
        with zipfile.ZipFile(file) as archive:
            info = archive.getinfo("receipts/example.json")
            raw = bytearray(file.read_bytes())
            name_length, extra_length = struct.unpack_from("<HH", raw, info.header_offset + 26)
            raw[info.header_offset + 30 + name_length + extra_length] ^= 1
        file.write_bytes(raw)
        self.reject(file, "UNREADABLE_ARCHIVE_OR_MANIFEST")

    def test_encrypted_flag_is_rejected_without_reading(self):
        file = self.archive()
        raw = bytearray(file.read_bytes())
        for signature, delta in ((b"PK\x01\x02", 8), (b"PK\x03\x04", 6)):
            offset = raw.index(signature)
            flags = struct.unpack_from("<H", raw, offset + delta)[0]
            struct.pack_into("<H", raw, offset + delta, flags | 1)
        file.write_bytes(raw)
        self.reject(file, "ENCRYPTED_MEMBER")

    def test_wrong_outer_archive_hash(self):
        report = self.reject(self.archive(), "ARCHIVE_HASH_MISMATCH", expected_sha256="0" * 64)
        self.assertEqual(report["verifiedFileCount"], 3)

    def test_wrong_expected_current_version(self):
        self.reject(self.archive(), "VERSION_MISMATCH", expected_version="1.0.3")

    def test_current_world_and_kit_required(self):
        manifest = json.loads(json.dumps(self.manifest))
        manifest["currentVersion"] = "1.0.3"
        self.reject(self.archive(manifest=manifest), "CURRENT_ASSETS_MISSING")

    def test_uncompressed_byte_limit(self):
        self.reject(self.archive(), "TOTAL_BUDGET", max_total_bytes=20)

    def test_nondeterministic_timestamp_requires_explicit_option(self):
        file = self.archive(nondeterministic=True)
        self.reject(file, "NONDETERMINISTIC_METADATA")
        report = verify_archive(file, require_deterministic=False)
        self.assertTrue(report["passed"], report)
        self.assertFalse(report["deterministicMetadataProfile"])

    def test_cli_nonzero_and_receipt(self):
        file = self.archive(duplicate="receipts/example.json")
        receipt = self.base / "receipt.json"
        process = subprocess.run([sys.executable, str(Path(__file__).with_name("verify_staging.py")), str(file), "--report", str(receipt)], capture_output=True, text=True)
        self.assertEqual(process.returncode, 1, process.stderr)
        self.assertFalse(json.loads(receipt.read_text())["passed"])
        self.assertEqual(json.loads(receipt.read_text()), json.loads(process.stdout))


if __name__ == "__main__":
    unittest.main()
