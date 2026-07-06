from pathlib import Path

source = (Path(__file__).parent / "render_v1_round.py").read_text(encoding="utf-8")
assert "ASSET_FORGE_REQUIRE_PROVIDER" in source
assert "result.renderer != \"provider\"" in source
assert source.index("result.renderer != \"provider\"") < source.index("result.image.save")
print("provider-required write guard passed")
