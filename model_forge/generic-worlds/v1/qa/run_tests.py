#!/usr/bin/env python3
"""Run the rejection suite and emit a receipt tied to exact tested source bytes."""
from datetime import datetime, timezone
import argparse
import hashlib
from io import StringIO
import json
from pathlib import Path
import platform
import sys
import time
import unittest

import numpy
import PIL


def suite_ids(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            yield from suite_ids(test)
        else:
            yield test.id()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.report and args.report.exists():
        parser.error("Receipt already exists; choose a versioned successor path")
    root = Path(__file__).parent
    sources = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.glob("*.py"))}
    suite = unittest.defaultTestLoader.discover(str(root), pattern="test_*.py")
    tests = list(suite_ids(suite))
    stream = StringIO()
    start = time.monotonic()
    result = unittest.TextTestRunner(stream=stream, verbosity=2).run(suite)
    stable = all(hashlib.sha256((root / name).read_bytes()).hexdigest() == digest for name, digest in sources.items())
    report = {"schemaVersion": "urai-generic-world-rejection-test-receipt-v1", "testedAt": datetime.now(timezone.utc).isoformat(),
              "command": "python model_forge/generic-worlds/v1/qa/run_tests.py", "pythonVersion": platform.python_version(),
              "numpyVersion": numpy.__version__, "pillowVersion": PIL.__version__, "sourceSha256": sources,
              "sourceUnchangedDuringTests": stable, "testsRun": result.testsRun, "testIds": tests,
              "failures": [{"id": t.id(), "detail": d} for t, d in result.failures],
              "errors": [{"id": t.id(), "detail": d} for t, d in result.errors],
              "skipped": [{"id": t.id(), "reason": d} for t, d in result.skipped],
              "durationSeconds": time.monotonic() - start, "passed": result.wasSuccessful() and stable,
              "testLogSha256": hashlib.sha256(stream.getvalue().encode()).hexdigest(),
              "testLog": stream.getvalue(), "scope": "Exported-byte corruption, geometry/reference/budget checks, planar navigation, dependency hashes; no visual/runtime/device acceptance"}
    output = json.dumps(report, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output)
    print(output, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
