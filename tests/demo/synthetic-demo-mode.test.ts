import {
  SYNTHETIC_DEMO_OWNER_ID,
  SYNTHETIC_DEMO_SOURCE,
  assertSyntheticDemoRecord,
  getSyntheticDemoTimeline,
} from "../../src/lib/demo/synthetic-demo-data";

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const mustThrow = (callback: () => void, message: string): void => {
  let threw = false;
  try {
    callback();
  } catch {
    threw = true;
  }
  assert(threw, message);
};

const records = getSyntheticDemoTimeline();
assert(records.length > 0, "synthetic demo timeline should include records.");

for (const record of records) {
  assert(record.ownerId === SYNTHETIC_DEMO_OWNER_ID, "demo record owner must be synthetic-demo.");
  assert(record.demoMode === true, "demo record must be marked demo mode.");
  assert(record.isSynthetic === true, "demo record must be synthetic.");
  assert(record.source === SYNTHETIC_DEMO_SOURCE, "demo record must carry synthetic source.");
}

mustThrow(
  () =>
    assertSyntheticDemoRecord({
      ...records[0],
      ownerId: "real-user" as typeof SYNTHETIC_DEMO_OWNER_ID,
    }),
  "real user records must not pass synthetic demo isolation.",
);
