# IMAGE semantic input binding

The Python IMAGE/Cinema leaf now uses exact `rfc8785==0.1.4` for its semantic
JSON input digest. Its ECMAScript number serialization and UTF-16 key ordering
match the actual current Model request consumer for the shared valid numeric
domain. `1`, `1.0` and `1e0` share semantics; so do `0` and `-0.0`. Reordering
keys or changing whitespace cannot open another semantic claim.

This helper is separate from the existing exact source input digest and the
endpoint/body wire digest. Those hashes and original bytes remain unchanged.
Python rejects nonfinite values, unsafe integer values outside the exact
IEEE-754 integer domain, invalid Unicode and unsupported values before gateway
admission. Duplicate input keys remain rejected by the existing JSON parser.
No signed approval, gateway authentication, protected provider control, price,
time limit, account hold or charge reconciliation rule is relaxed.

The Python tests compare actual Model `freezeRequest` output against the Python
helper using numbers, escapes, nested arrays and keys whose UTF-16 order differs
from Unicode code point order. They retain distinct exact source and wire hashes.
The actual gateway test uses synthetic signed records to reject an equivalent
numeric request under a different source job after both an open reservation and
final charge reconciliation. Synthetic fixtures cannot authorize a real request.

The canonical gateway and worker route source bodies are unchanged. Native
combined-source checks, owner admission and current genuine signing/account/
provider authorities remain separate requirements for production execution.

The generator and its protected executor use `Pillow==12.3.0`. The previous
`<12.0.0` generator constraint admitted versions affected by the official
Pillow HIGH advisories [GHSA-9hw9-ch79-4vh6](https://github.com/python-pillow/Pillow/security/advisories/GHSA-9hw9-ch79-4vh6)
and [GHSA-6r8x-57c9-28j4](https://github.com/python-pillow/Pillow/security/advisories/GHSA-6r8x-57c9-28j4).
Both identify 12.3.0 as a fixed version. The dependency update is checked by the
actual paid and offline generator tests; it does not constitute an independent
review or authorize provider execution.
