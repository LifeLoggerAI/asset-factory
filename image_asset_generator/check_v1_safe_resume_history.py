from __future__ import annotations

import sys

import check_v1_safe_resume_history_core as core

PRIOR_MARKER = "0cf837d585d3d1c1d8e171938037098c72230c22"
original = core.curl_bytes


def compatible_download(url: str, token: str, *, accept: str = "application/vnd.github+json") -> bytes:
    media_type = "application/vnd.github+json" if url.endswith("/zip") else accept
    return original(url, token, accept=media_type)


core.curl_bytes = compatible_download

if __name__ == "__main__":
    if "--self-test" not in sys.argv and PRIOR_MARKER not in sys.argv:
        sys.argv.extend(["--marker-sha", PRIOR_MARKER])
    raise SystemExit(core.main())
