# Factory dependency repairs at every advisory severity

The original complete installed scans at `8e03150c` retained 31 findings: 27 moderate and 4 low, covering 22 package/advisory pairs. Their HIGH/CRITICAL gates passed; those results were not an all-severity clean graph.

This repair preserves the original matcher, historical reviewed corpus, current reviewed corpus pin, and HIGH/CRITICAL thresholds. A separate fail-closed closure step now requires both complete installed reports to have no findings at any severity. Missing dependencies, incomplete graphs and missing reports still fail. The mandatory native workflows install both governed frozen graphs; source-lock registry audits and isolated public-source compatibility tests do not substitute for those installed results.

Published upstream patch versions repair busboy, qs, postcss, brace-expansion, ip-address, uuid, ajv, yaml, once, Babel core, body-parser, humanfs and fast-uri. `uuid` 11.1.1 retains CommonJS for the existing engine and Google SDK consumers; healthy uuid 13 remains. The engine continues to call the supported `v4` API. Both workspace and deployment locks retain the supported Firebase SDK versions.

The Firebase test helper still depends on vulnerable `ts-deepmerge` 2 even in upstream 3.5.0. The licensed 3.4.1 consumer patch uses the maintained version 8 named `merge` API. The actual CloudEvent generator is tested for nested fields, ordered unique arrays, undefined/absent overrides, immutable Firebase SDK data and rejection of attacker-controlled prototype method shadowing. All other published helper source and declaration files retain their upstream hashes.

`sprintf-js` has no published fixed version. Its only governed ingress is YAML 3's obsolete argparse 1 CLI dependency. The licensed YAML 3 consumer patch uses maintained argparse 2 APIs and removes that formatter dependency. YAML 3 library exports, loaders, dumpers and schemas retain their exact upstream bytes. Actual CLI comparisons preserve stdin/file conversion, supported flags, version output, compact errors and exit statuses. No artificial package rename or advisory exception is used.

The committed provenance binds both patches, exact upstream tarball integrity, licenses, every runtime/declaration source file and patched installed bytes. Installed verification requires those actual consumers and replacement versions inside the checkout, and rejects sprintf-js, argparse 1 and ts-deepmerge 2 anywhere in the complete installed graph. Original tooling replacement, lint/type/build/dependency-audit checks and the historical unwaived braces evidence remain intact.

This is source/dependency convergence. It does not provision credentials or protected records, sign real approvals, admit a paid job, deploy, merge main, or provide independent security/release qualification.
