import crypto from "crypto";
import { db } from "./firebase";

export const validateApiKey = async (key: string) => {
  const hash = crypto.createHash("sha256").update(key).digest("hex");

  const snapshot = await db.collection("apiKeys")
    .where("keyHash", "==", hash)
    .where("active", "==", true)
    .get();

  if (snapshot.empty) throw new Error("Invalid API Key");

  return snapshot.docs[0].data();
};
