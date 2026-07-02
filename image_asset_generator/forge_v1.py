"""Compatibility entry point for the cost-aware V1 production forge."""

import os

endpoint = os.environ.get("ASSET_RENDERER_ENDPOINT", "").lower()
if "api.openai.com" in endpoint:
    os.environ.setdefault("ASSET_RENDERER_PROVIDER", "openai")

from forge_v1_cost_aware import main


if __name__ == "__main__":
    raise SystemExit(main())
