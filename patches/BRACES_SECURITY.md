# Factory braces local mitigation

This donor applies the exact Studio patch at 5d2cfdf3dcae738e0ebde50ab70e85f1d02c2e36, originally derived from Investors 1ecff671d6fd2eb095828e5ab47a4bf7726aeb33. The original MIT license, braces 3.0.3 identity and upstream integrity stay intact. No upstream patched release is claimed.

The five runtime guards bound brace/parenthesis parsing and compile/expand/stringify AST traversal to 128; callers cannot raise the bound. pnpm patchedDependencies binds the exact patch to the frozen workspace graph without changing unrelated dependency resolutions.

The verifier discovers every actual installed braces instance from the existing complete installed-graph resolver, verifies all five patched file hashes, tests ordinary/boundary/adversarial patterns and supplied ASTs, and exercises each actual micromatch and fast-glob consumer. Missing dependencies, altered code, unexpected versions, duplicate instances, omitted consumers and outside-checkout source fail closed. The native receipt is bound to the exact source and run, and is written only after all behavioral assertions succeed.

The existing raw HIGH advisory scanner and production deployment dependency remain unchanged. GHSA-vfj7-8cjw-p6xm continues to report HIGH/BLOCKED. This mitigation proof is source evidence for the existing security review process; it does not waive the finding or grant deployment, provider, art, device or release acceptance. Admission requires deliberate owner integration, fresh combined-head behavior, and the applicable review policy. An upstream fix must replace this local patch once published and accepted.

Local cached installed consumer checks are explicitly separate from the final frozen native install. The dedicated native workflow preserves exact-head/clean-source verification, installs the committed frozen graph and rejects source drift. No credentials or paid provider calls are used.
