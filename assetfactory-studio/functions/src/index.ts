import { onRequest } from "firebase-functions/v2/https";
import { AssetJobRequestValidator } from "../api/lib/validators";
import { PRESETS } from "../api/lib/presets";
import { generateDeterministicSeed } from "../api/lib/determinism";
import { validateApiKey } from "../api/lib/api-keys";
import { recordUsage } from "../api/lib/usage";

export const assetFactory = onRequest({ region: "us-central1" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || typeof apiKey !== "string") {
    res.status(401).send("Unauthorized");
    return;
  }

  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    res.status(401).send("Unauthorized");
    return;
  }

  const result = AssetJobRequestValidator.safeParse(req.body);

  if (!result.success) {
    res.status(400).send(result.error.flatten());
    return;
  }

  let { preset, assets, prompt, deterministic } = result.data;

  if (preset) {
    assets = { ...assets, ...PRESETS[preset] };
  }

  if (deterministic) {
    const seed = generateDeterministicSeed(result.data);
    // you can use the seed to generate deterministic assets
  }

  await recordUsage(apiKey, Object.keys(assets).filter(k => assets[k as keyof typeof assets]));

  res.status(200).send({ message: "Asset job started successfully!" });
});
