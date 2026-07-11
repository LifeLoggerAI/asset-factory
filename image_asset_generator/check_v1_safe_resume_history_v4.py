from __future__ import annotations

import check_v1_safe_resume_history as base

_original_curl_bytes = base.curl_bytes


def curl_bytes(
    url: str,
    token: str,
    *,
    accept: str = "application/vnd.github+json",
) -> bytes:
    # GitHub's artifact archive endpoint returns HTTP 415 for
    # application/octet-stream. The documented GitHub JSON media type
    # returns the signed redirect and curl follows it without forwarding
    # the repository token to the storage host.
    if url.endswith("/zip"):
        accept = "application/vnd.github+json"
    return _original_curl_bytes(url, token, accept=accept)


base.curl_bytes = curl_bytes


if __name__ == "__main__":
    raise SystemExit(base.main())
