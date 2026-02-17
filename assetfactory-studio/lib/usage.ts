import { db } from "./firebase";

export const logUsage = async (
  projectId: string,
  jobId: string,
  computeUnits: number,
  costEstimate: number
) => {
  await db.collection("usageLogs").add({
    projectId,
    jobId,
    computeUnits,
    costEstimate,
    createdAt: new Date(),
  });
};
