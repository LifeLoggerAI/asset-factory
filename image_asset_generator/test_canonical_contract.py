from canonical_release_manifests import snapshot

EXPECTED = {
    "v1": (53, "assets/urai/"),
    "v2": (80, "assets/urai/v2/"),
    "v3": (14, "assets/urai/v3/"),
    "v4": (39, "assets/urai/xr/"),
    "v5": (27, "assets/urai/v5/"),
}

for version, (count, prefix) in EXPECTED.items():
    receipt = snapshot(version)
    assert receipt["expectedOutputs"] == count, receipt
    assert receipt["actualOutputs"] == count, receipt
    assert receipt["assetPrefix"].rstrip("/") + "/" == prefix, receipt
    assert receipt["targetRepo"] == "LifeLoggerAI/urai-spatial", receipt

print("PASS canonical V1-V5 asset contract")
