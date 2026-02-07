# REPLAY-ENGINE — v1.0.0 LOCK

## Purpose
The Replay Engine is the canonical system for transforming structured Life-Map data into cinematic, shareable video assets. It bridges the gap between data and narrative experience.

---

## What The Replay Engine Guarantees

1.  **Compositional Integrity**  
    Replays are built from a well-defined sequence of scenes, assets, and audio tracks.

2.  **Template-Driven Structure**  
    The composition and visual structure of scenes are based on versioned, predefined templates.

3.  **Asset Provenance**  
    All assets used in a replay are sourced directly from the Asset Factory, ensuring traceability.

4.  **Render Traceability**  
    Every rendered video is linked back to a specific ReplayJob, a Life-Map version, and the user who initiated it.

---

## What Must Never Change (Invariants)

- No render can exist without a corresponding `ReplayJob`.
- All visual and audio assets MUST be consumed from the Asset Factory.
- A rendered video, once created, is immutable.
- The final rendered video MUST be registered as an asset in the Asset Factory.

---

## Status

Version: v1.0.0  
State: SEALED  
OPS_COMPLETE: true  

This file is immutable for v1.x.
