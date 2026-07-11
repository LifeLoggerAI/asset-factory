#!/usr/bin/env python3
"""Download a GitHub Actions artifact without forwarding API credentials to storage.

GitHub's artifact download endpoint returns a short-lived redirect to object storage.
The authenticated API request and the unauthenticated storage request are deliberately
separate so the run-scoped token can never cross origins.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

API_VERSION = "2022-11-28"
USER_AGENT = "urai-github-artifact-download/1"
REDIRECT_CODES = {301, 302, 303, 307, 308}
DEFAULT_MAX_BYTES = 512 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Expose redirects to the caller instead of following them automatically."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _bounded_read(response: Any, max_bytes: int) -> bytes:
    length = response.headers.get("Content-Length")
    if length:
        try:
            declared = int(length)
        except ValueError as exc:
            raise RuntimeError("artifact response has an invalid Content-Length") from exc
        if declared > max_bytes:
            raise RuntimeError(
                f"artifact exceeds configured byte ceiling: {declared} > {max_bytes}"
            )

    payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise RuntimeError(f"artifact exceeds configured byte ceiling: > {max_bytes}")
    return payload


def _validate_redirect(source_url: str, location: str | None) -> str:
    if not location:
        raise RuntimeError("artifact redirect is missing Location")

    target = urllib.parse.urljoin(source_url, location)
    parsed = urllib.parse.urlparse(target)
    if parsed.scheme != "https":
        raise RuntimeError("artifact redirect must use HTTPS")
    if not parsed.hostname:
        raise RuntimeError("artifact redirect must include a hostname")
    if parsed.username or parsed.password:
        raise RuntimeError("artifact redirect must not contain userinfo")
    return target


def github_api_json(
    url: str,
    token: str,
    *,
    timeout: int = 90,
) -> dict[str, Any]:
    """Read one GitHub API JSON response and reject unexpected redirects."""

    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": USER_AGENT,
        },
    )
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            payload = response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in REDIRECT_CODES:
            raise RuntimeError("unexpected redirect from GitHub JSON API") from exc
        raise

    decoded = json.loads(payload.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise RuntimeError("GitHub JSON API response must be an object")
    return decoded


def download_artifact(
    repository: str,
    artifact_id: int,
    token: str,
    output_path: str | os.PathLike[str],
    *,
    api_root: str = "https://api.github.com",
    timeout: int = 90,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> Path:
    """Download an artifact zip using auth only for the first GitHub API request."""

    if not repository or "/" not in repository:
        raise ValueError("repository must use owner/name form")
    if artifact_id <= 0:
        raise ValueError("artifact_id must be positive")
    if not token:
        raise ValueError("token is required")
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")

    api_url = (
        f"{api_root.rstrip('/')}/repos/{repository}/actions/artifacts/"
        f"{artifact_id}/zip"
    )
    api_request = urllib.request.Request(
        api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": USER_AGENT,
        },
    )
    opener = urllib.request.build_opener(NoRedirect())

    try:
        with opener.open(api_request, timeout=timeout) as response:
            payload = _bounded_read(response, max_bytes)
    except urllib.error.HTTPError as exc:
        if exc.code not in REDIRECT_CODES:
            raise
        location = exc.headers.get("Location")
        exc.close()
        storage_url = _validate_redirect(api_url, location)

        # Deliberately construct a brand-new request with no Authorization,
        # API-version, cookie, or GitHub-specific headers.
        storage_request = urllib.request.Request(
            storage_url,
            headers={
                "Accept": "application/octet-stream",
                "User-Agent": USER_AGENT,
            },
        )
        with urllib.request.urlopen(storage_request, timeout=timeout) as response:
            payload = _bounded_read(response, max_bytes)

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=destination.parent, prefix=f".{destination.name}.", delete=False
    ) as temporary:
        temporary.write(payload)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    os.chmod(temporary_path, 0o600)
    temporary_path.replace(destination)
    return destination


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True)
    parser.add_argument("--artifact-id", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com"))
    parser.add_argument("--token-env", default="GH_TOKEN")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    token = os.environ.get(args.token_env, "")
    result = download_artifact(
        args.repository,
        args.artifact_id,
        token,
        args.output,
        api_root=args.api_root,
        max_bytes=args.max_bytes,
    )
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
