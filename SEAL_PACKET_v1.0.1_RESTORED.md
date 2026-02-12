# ASSET FACTORY V1.0.1 RESTORATION SEAL

## Restoration Summary

The Asset Factory system was temporarily expanded beyond its V1 specification to include:

- Firebase authentication
- Usage tracking
- UI layer
- SaaS-style user identity logic

These elements were removed to restore the original V1 integrity model.

## What Was Removed

- All Firebase dependencies
- JWT verification
- User identity logic
- Usage tracking
- Plan tiers
- Login endpoints
- Non-V1 routes

## What Was Restored

- API-key-only authentication
- File-based job queue
- Headless API-only architecture
- Deterministic output design
- Worker-based asynchronous processing

## Determinism Guarantee

For identical input payloads:

- Input hash is calculated via SHA256
- Output bundle filename derived from hash
- ZIP order fixed
- No dynamic timestamps included
- Manifest includes inputHash
- Worker produces stable file structure

Repeated builds produce bit-identical ZIP archives.

## Governance Status

Version: 1.0.1-restored  
Status: FROZEN  
Scope: Internal-only deterministic engine  
UI: None  
Identity: None  
Billing: None  
User model: None  

The system is hereby re-sealed under V1 integrity constraints.

Any modification beyond this spec requires formal version increment and re-seal.

Signed:
Asset Factory Maintainer
