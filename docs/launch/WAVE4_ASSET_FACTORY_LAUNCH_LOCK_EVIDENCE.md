# Wave 4 URAI Asset Factory Launch Lock Evidence

Domain: uraiassetfactory.com

Repo: LifeLoggerAI/asset-factory

Canonical repo note: `LifeLoggerAI/urai-asset-factory` was not found. This repo is being used as the active Asset Factory implementation surface unless a new canonical repo is created.

Status: implementation evidence in progress

## Required role

URAI Asset Factory is the gated production forge for assets, scenes, characters, voices, exports, manifests, provider metadata, approvals, and release evidence.

## Required public routes

- `/`
- `/request-access`
- `/login`
- `/privacy`
- `/terms`

## Required protected routes

- `/dashboard`
- `/projects`
- `/assets`
- `/characters`
- `/scenes`
- `/voices`
- `/exports`
- any private prompts
- any unreleased assets
- any client assets
- any protected IP records

## Required public boundary

Public pages must not expose prompt secrets, unreleased IP, client assets, private voice assets, internal manifests, export packages, provider keys, or production evidence.

## Required access behavior

- Request-access form writes to `leads` with `leadType=asset_factory_access` or approved backend.
- Portal routes require approved access before any private content renders.
- Protected routes must include noindex/nofollow/noarchive metadata.
- Asset approvals and exports should be audit logged or have an audit plan.

## Required shared foundation

- Shared visual foundation or equivalent
- Metadata/no-index pattern
- URAI Privacy link
- UTM/source capture on access request form
- Denied-access state
- Loading state that does not flash private data
- QA script for metadata, privacy links, no-index, and placeholder/debug text

## Evidence still required before approval

- Confirm public routes exist
- Confirm protected routes are gated and no-indexed
- Confirm no private assets render before auth
- Confirm request-access form writes to approved backend
- Confirm UTM/source capture works
- Confirm audit logging or audit plan for approvals and exports
- Run build/typecheck/QA
- Confirm DNS and SSL for `uraiassetfactory.com`
- Record production deployment URL
- Record latest deploy commit
- Record owner approval

## Current launch decision

Do not mark approved until route, gate, no-index, form, asset-boundary, audit, privacy, DNS/SSL, build, and QA evidence are recorded.
