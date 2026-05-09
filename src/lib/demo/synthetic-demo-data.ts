import { assertFeatureEnabled } from "../feature-flags/urai-feature-flags";

export const SYNTHETIC_DEMO_OWNER_ID = "synthetic-demo";
export const SYNTHETIC_DEMO_SOURCE = "urai-tier-one-synthetic-demo-v1";

export interface SyntheticDemoRecord {
  id: string;
  ownerId: typeof SYNTHETIC_DEMO_OWNER_ID;
  demoMode: true;
  isSynthetic: true;
  source: typeof SYNTHETIC_DEMO_SOURCE;
  title: string;
  description: string;
  createdAt: string;
}

export const SYNTHETIC_DEMO_TIMELINE: SyntheticDemoRecord[] = [
  {
    id: "demo-calm-morning",
    ownerId: SYNTHETIC_DEMO_OWNER_ID,
    demoMode: true,
    isSynthetic: true,
    source: SYNTHETIC_DEMO_SOURCE,
    title: "A calmer morning",
    description: "Synthetic demo event showing a gentle reflective timeline moment.",
    createdAt: "2026-05-09T08:00:00.000Z",
  },
  {
    id: "demo-soft-reset",
    ownerId: SYNTHETIC_DEMO_OWNER_ID,
    demoMode: true,
    isSynthetic: true,
    source: SYNTHETIC_DEMO_SOURCE,
    title: "Soft reset",
    description: "Synthetic demo event for emotional weather without real user data.",
    createdAt: "2026-05-09T12:00:00.000Z",
  },
];

export function assertSyntheticDemoRecord(record: SyntheticDemoRecord): void {
  assertFeatureEnabled("synthetic_public_demo", "demo");

  if (record.ownerId !== SYNTHETIC_DEMO_OWNER_ID || !record.demoMode || !record.isSynthetic) {
    throw new Error(`URAI demo isolation violation: record "${record.id}" is not synthetic-demo isolated.`);
  }

  if (record.source !== SYNTHETIC_DEMO_SOURCE) {
    throw new Error(`URAI demo isolation violation: record "${record.id}" has an invalid source.`);
  }
}

export function getSyntheticDemoTimeline(): SyntheticDemoRecord[] {
  SYNTHETIC_DEMO_TIMELINE.forEach(assertSyntheticDemoRecord);
  return SYNTHETIC_DEMO_TIMELINE.map((record) => ({ ...record }));
}
