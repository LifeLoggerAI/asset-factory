# Exact-byte generic world archive format

Asset binaries are staged externally as a ZIP. Code, metadata, rejection tests,
and verification receipts can be preserved in the repository without asserting
that binary bytes remain in GitHub. The verifier never fetches a URL, extracts
members, updates a runtime resolver, or grants visual/release acceptance.

The archive has file members only, with paths relative to the generic-world
artifact root. It includes `packages/`, `kits/`, retained predecessor versions,
previews, receipts, and associated asset/data documentation. Build and QA source
code is excluded. The current version must have at least one GLB beneath both
`packages/` and `kits/`; exact world/kit completeness and geometry checks remain
the separate source-bound package QA receipt.

The root `artifact-manifest.json` has this minimal schema:

```json
{
  "schemaVersion": 1,
  "truthClassification": "GENERIC",
  "currentVersion": "1.0.2",
  "files": [
    {"path": "kits/example/1.0.2/lod0.glb", "bytes": 123, "sha256": "64 lowercase hexadecimal characters"},
    {"path": "packages/gw-example/1.0.2/lod0.glb", "bytes": 456, "sha256": "64 lowercase hexadecimal characters"}
  ]
}
```

Every ZIP member except the root manifest appears exactly once in `files[]`.
The manifest excludes itself to avoid a self-referential hash. The verifier
reports its exact embedded SHA-256 and the whole ZIP SHA-256 separately.
Optional additional manifest fields are allowed; they cannot change the required
truth classification or byte inventory. An outer expected SHA-256 provides the
independent link to the publication/upload receipt.

```sh
python model_forge/generic-worlds/v1/qa/verify_staging.py path/to/archive.zip --expected-version 1.0.2 --expected-sha256 EXACT_ZIP_SHA256 --report path/to/versioned-staging-receipt.json
python -m unittest discover -s model_forge/generic-worlds/v1/qa -p 'test_*.py' -v
```

The CLI returns JSON on stdout and exits nonzero on rejection. It refuses to
overwrite an existing receipt. CI can run rejection tests with no archive. It
must execute archive verification only when actual local ZIP bytes are supplied;
a URL, download pointer, historical receipt, or metadata-only PR cannot substitute
for the ZIP input. Missing archive bytes are not an archive verification pass.

Safe paths use canonical NFC POSIX names with no absolute paths, backslashes,
drive/stream colons, controls, empty/dot/parent components, reserved Windows
device names, or platform-ambiguous trailing dots/spaces. Names must be unique
even under case folding. Symlinks, devices, directory entries, encrypted members,
source/runtime trees, unsupported file types, and unlisted files are rejected.
Only stored/deflated ZIP members are supported. Allowed data/document extensions
are `.glb`, `.gltf`, `.bin`, `.json`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.wav`,
`.ogg`, `.mp3`, `.ktx2`, `.md`, `.txt`, `.pdf`, `.svg`, plus `LICENSE`/`NOTICE`.
This allowlist excludes `.py`, `.js`, `.mjs`, `.ts`, `.tsx`, `.sh` and other source.

The default deterministic metadata profile requires lexically sorted ZIP entries
and file inventory, `ZipInfo.date_time=(1980,1,1,0,0,0)`, `create_system=3`,
`external_attr=(stat.S_IFREG | 0o644) << 16`, `internal_attr=0`, and empty
member/archive comments and extra fields. Use `ZipInfo` plus `writestr` rather
than importing source mtimes/permissions. `--allow-nondeterministic` preserves
the measured metadata flag while relaxing that one profile requirement; byte
integrity and all path/member restrictions continue to apply. Fixed headers do
not alone prove cross-platform compression/rebuild reproducibility.

The verifier reads each member through EOF, checks ZIP CRC, measures actual
decompressed bytes, and calculates SHA-256. It rejects file/total/member budget
overruns and ZIP prefix/trailing unlisted bytes. It hashes the whole archive
before and after verification to detect changing input. Defaults allow 1 GB per
member, 4 GB total uncompressed data, 16 MB manifest, and 100,000 members; byte
limits can be tightened through CLI flags.

Implementation reference: [Python `zipfile` documentation](https://docs.python.org/3/library/zipfile.html).
Archive integrity establishes the staged bytes and inventory. It does not prove
external availability, licensing, geometry quality, visual acceptance, runtime
integration, independent approval, or release acceptance.
