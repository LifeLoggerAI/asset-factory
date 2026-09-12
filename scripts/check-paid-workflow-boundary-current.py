#!/usr/bin/env python3
"""Run the canonical paid-workflow checker with current exact marker authorities.

The base checker intentionally remains a reusable parser and fail-closed scanner.
This adapter records exact motion-film authorities without broadening provider
access, triggers, retries, promotion, deployment, delivery, or release.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MODULE_PATH = SCRIPT_DIR / "check-paid-workflow-boundary.py"
spec = importlib.util.spec_from_file_location("check_paid_workflow_boundary", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

CURRENT_MARKER_WORKFLOWS = {
    Path(".github/workflows/one-time-before-rest-world-cinematic-motion.yml"): "authorizations/execute-before-rest-world-cinematic-motion-20260801.json",
    Path(".github/workflows/one-time-before-rest-world-full-master-t1.yml"): "authorizations/execute-before-rest-world-full-master-t1-20260801.json",
    Path(".github/workflows/one-time-built-from-survival-hero-cinema.yml"): "authorizations/execute-built-from-survival-hero-cinema-20260829.json",
    Path(".github/workflows/one-time-finite-time-openai-physics-validation.yml"): "authorizations/execute-finite-time-openai-physics-validation-20260912.json",
    Path(".github/workflows/one-time-finite-time-openai-physics-validation-v2.yml"): "authorizations/execute-finite-time-openai-physics-validation-v2-20260912.json",
    Path(".github/workflows/one-time-finite-time-openai-representative-validation.yml"): "authorizations/execute-finite-time-openai-representative-validation-20260912.json",
    Path(".github/workflows/one-time-finite-time-openai-representative-retry-v2.yml"): "authorizations/execute-finite-time-openai-representative-retry-v2-20260912.json",
    Path(".github/workflows/one-time-finite-time-openai-nonprivate-story-wave.yml"): "authorizations/execute-finite-time-openai-nonprivate-story-wave-20260912.json",
    Path(".github/workflows/one-time-finite-time-openai-semantic-canary.yml"): "authorizations/execute-finite-time-openai-semantic-canary-20260912.json",
    Path(".github/workflows/one-time-finite-time-openai-nonprivate-wave-v2.yml"): "authorizations/execute-finite-time-openai-nonprivate-wave-v2-20260912.json",
}

for workflow, marker in CURRENT_MARKER_WORKFLOWS.items():
    existing = module.AUTHORIZED_MARKER_WORKFLOWS.get(workflow)
    if existing is not None and existing != marker:
        raise RuntimeError(f"paid workflow authority conflict for {workflow}: {existing} != {marker}")
    module.AUTHORIZED_MARKER_WORKFLOWS[workflow] = marker

AUTHORIZED_MARKER_WORKFLOWS = module.AUTHORIZED_MARKER_WORKFLOWS
inspect = module.inspect

def main() -> int: return module.main()
if __name__ == "__main__": raise SystemExit(main())
