#!/usr/bin/env python3
"""Download GitHub Actions artifacts without forwarding API credentials to storage.

GitHub's artifact download endpoint returns a short-lived redirect to object storage.
The authenticated API request and the unauthenticated storage request are deliberately
separate so the run-scoped token can never cross origins.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

API_VERSION = "2022-11-28"
USER_AGENT = "urai-github-artifact-download/1"
REDIRECT_CODES = {301, 302, 303, 307, 308}
DEFAULT_MAX_BYTES = 512 * 1024 * 1024
DEFAULT_MAX_JSON_BYTES = 16 * 1024 * 1024
DEFAULT_MAX_EXTRACTED_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_TOTAL_EXTRACTED_BYTES = 512 * 1024 * 1024
DEFAULT_MAX_MEMBERS = 4096


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


def _bounded_read(response: Any, max_bytes: int, label: str = "artifact") -> bytes:
    length = response.headers.get("Content-Length")
    if length:
        try:
            declared = int(length)
        except ValueError as exc:
            raise RuntimeError(f"{label} response has an invalid Content-Length") from exc
        if declared < 0:
            raise RuntimeError(f"{label} response has a negative Content-Length")
        if declared > max_bytes:
            raise RuntimeError(
                f"{label} exceeds configured byte ceiling: {declared} > {max_bytes}"
            )

    payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise RuntimeError(f"{label} exceeds configured byte ceiling: > {max_bytes}")
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


def _atomic_write(destination: Path, payload: bytes) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            delete=False,
        ) as temporary:
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        os.chmod(temporary_path, 0o600)
        temporary_path.replace(destination)
        return destination
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def github_api_json(
    url: str,
    token: str,
    *,
    timeout: int = 90,
    max_bytes: int = DEFAULT_MAX_JSON_BYTES,
) -> dict[str, Any]:
    """Read one bounded GitHub API JSON response and reject redirects."""

    if not token:
        raise ValueError("token is required")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("GitHub API URL must be absolute HTTPS")

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
            payload = _bounded_read(response, max_bytes, "GitHub JSON API")
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
    """Download an artifact ZIP using auth only for the GitHub API request."""

    if not repository or repository.count("/") != 1:
        raise ValueError("repository must use owner/name form")
    if artifact_id <= 0:
        raise ValueError("artifact_id must be positive")
    if not token:
        raise ValueError("token is required")
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")

    parsed_api_root = urllib.parse.urlparse(api_root)
    if parsed_api_root.scheme != "https" or not parsed_api_root.hostname:
        raise ValueError("api_root must be absolute HTTPS")

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

        # Construct a brand-new request with no Authorization, API-version,
        # cookie, or GitHub-specific headers.
        storage_request = urllib.request.Request(
            storage_url,
            headers={
                "Accept": "application/octet-stream",
                "User-Agent": USER_AGENT,
            },
        )
        with urllib.request.urlopen(storage_request, timeout=timeout) as response:
            payload = _bounded_read(response, max_bytes)

    return _atomic_write(Path(output_path), payload)


def _validate_member_type(member: zipfile.ZipInfo) -> None:
    if member.flag_bits & 0x1:
        raise RuntimeError(f"encrypted archive member is not accepted: {member.filename}")
    mode = (member.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    if member.is_dir():
        if file_type and file_type != stat.S_IFDIR:
            raise RuntimeError(
                f"directory archive member has an invalid type: {member.filename}"
            )
        return
    if file_type and file_type != stat.S_IFREG:
        raise RuntimeError(f"archive member is not a regular file: {member.filename}")


def _safe_member_parts(filename: str, *, allow_directory: bool) -> tuple[str, ...]:
    if not filename:
        raise RuntimeError("archive member has an empty name")
    if "\\" in filename:
        raise RuntimeError(f"archive member uses a backslash path: {filename}")
    if "\x00" in filename:
        raise RuntimeError("archive member name contains NUL")

    raw_parts = filename.split("/")
    if allow_directory and raw_parts[-1] == "":
        raw_parts = raw_parts[:-1]
    if not raw_parts or any(part in {"", ".", ".."} for part in raw_parts):
        raise RuntimeError(f"archive member path is not canonical: {filename}")
    if any(":" in part for part in raw_parts):
        raise RuntimeError(f"archive member path contains a drive-like component: {filename}")

    pure = PurePosixPath(*raw_parts)
    if pure.is_absolute():
        raise RuntimeError(f"archive member path must be relative: {filename}")
    return tuple(pure.parts)


def _assert_no_symlink_ancestors(root: Path, destination: Path) -> None:
    current = destination.parent
    while True:
        if current.exists() and current.is_symlink():
            raise RuntimeError(f"archive destination parent is a symlink: {current}")
        if current == root:
            break
        if root not in current.parents:
            raise RuntimeError("archive destination escaped extraction root")
        current = current.parent


def extract_unique_member_by_basename(
    archive_path: str | os.PathLike[str],
    basename: str,
    output_directory: str | os.PathLike[str],
    *,
    max_bytes: int = DEFAULT_MAX_EXTRACTED_BYTES,
) -> Path:
    """Extract one uniquely named regular file without trusting archive paths."""

    if not basename or Path(basename).name != basename or basename in {".", ".."}:
        raise ValueError("basename must be one plain filename")
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")

    archive = Path(archive_path)
    with zipfile.ZipFile(archive) as bundle:
        matches = [info for info in bundle.infolist() if Path(info.filename).name == basename]
        if len(matches) != 1:
            raise RuntimeError(
                f"archive must contain exactly one {basename}; found {len(matches)}"
            )
        member = matches[0]
        _validate_member_type(member)
        if member.is_dir():
            raise RuntimeError("requested archive member is a directory")
        if member.file_size > max_bytes:
            raise RuntimeError(
                f"extracted member exceeds configured byte ceiling: "
                f"{member.file_size} > {max_bytes}"
            )
        with bundle.open(member, "r") as source:
            payload = source.read(max_bytes + 1)
        if len(payload) > max_bytes:
            raise RuntimeError("extracted member exceeds configured byte ceiling")

    return _atomic_write(Path(output_directory) / basename, payload)


def extract_all_regular_files(
    archive_path: str | os.PathLike[str],
    output_directory: str | os.PathLike[str],
    *,
    max_member_bytes: int = DEFAULT_MAX_EXTRACTED_BYTES,
    max_total_bytes: int = DEFAULT_MAX_TOTAL_EXTRACTED_BYTES,
    max_members: int = DEFAULT_MAX_MEMBERS,
) -> list[Path]:
    """Safely extract a bounded ZIP tree containing only regular files/directories."""

    if max_member_bytes <= 0 or max_total_bytes <= 0 or max_members <= 0:
        raise ValueError("extraction ceilings must be positive")

    root = Path(output_directory)
    root.mkdir(parents=True, exist_ok=True)
    if root.is_symlink():
        raise RuntimeError("extraction root must not be a symlink")
    root = root.resolve()

    extracted: list[Path] = []
    seen_paths: set[tuple[str, ...]] = set()
    total_declared = 0

    with zipfile.ZipFile(Path(archive_path)) as bundle:
        members = bundle.infolist()
        if len(members) > max_members:
            raise RuntimeError(
                f"archive exceeds configured member ceiling: {len(members)} > {max_members}"
            )

        validated: list[tuple[zipfile.ZipInfo, tuple[str, ...]]] = []
        for member in members:
            _validate_member_type(member)
            parts = _safe_member_parts(
                member.filename,
                allow_directory=member.is_dir(),
            )
            if parts in seen_paths:
                raise RuntimeError(f"archive contains a duplicate path: {member.filename}")
            seen_paths.add(parts)
            if member.is_dir():
                continue
            if member.file_size > max_member_bytes:
                raise RuntimeError(
                    f"archive member exceeds configured byte ceiling: "
                    f"{member.file_size} > {max_member_bytes}: {member.filename}"
                )
            total_declared += member.file_size
            if total_declared > max_total_bytes:
                raise RuntimeError(
                    f"archive exceeds configured total extracted byte ceiling: "
                    f"{total_declared} > {max_total_bytes}"
                )
            validated.append((member, parts))

        for member, parts in validated:
            destination = root.joinpath(*parts)
            _assert_no_symlink_ancestors(root, destination)
            with bundle.open(member, "r") as source:
                payload = source.read(max_member_bytes + 1)
            if len(payload) > max_member_bytes:
                raise RuntimeError(
                    f"archive member exceeds configured byte ceiling: {member.filename}"
                )
            extracted.append(_atomic_write(destination, payload))

    return extracted


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True)
    parser.add_argument("--artifact-id", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--api-root", default=os.environ.get("GITHUB_API_URL", "https://api.github.com")
    )
    parser.add_argument("--token-env", default="GH_TOKEN")
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)

    extraction = parser.add_mutually_exclusive_group()
    extraction.add_argument("--extract-basename")
    extraction.add_argument("--extract-all-directory")
    parser.add_argument("--extract-directory")
    parser.add_argument(
        "--max-extracted-bytes", type=int, default=DEFAULT_MAX_EXTRACTED_BYTES
    )
    parser.add_argument(
        "--max-total-extracted-bytes",
        type=int,
        default=DEFAULT_MAX_TOTAL_EXTRACTED_BYTES,
    )
    parser.add_argument("--max-members", type=int, default=DEFAULT_MAX_MEMBERS)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if bool(args.extract_basename) != bool(args.extract_directory):
        raise SystemExit(
            "--extract-basename and --extract-directory must be provided together"
        )
    if args.extract_all_directory and args.extract_directory:
        raise SystemExit(
            "--extract-directory is only valid with --extract-basename"
        )

    token = os.environ.get(args.token_env, "")
    archive = download_artifact(
        args.repository,
        args.artifact_id,
        token,
        args.output,
        api_root=args.api_root,
        max_bytes=args.max_bytes,
    )
    print(archive)

    if args.extract_basename:
        extracted = extract_unique_member_by_basename(
            archive,
            args.extract_basename,
            args.extract_directory,
            max_bytes=args.max_extracted_bytes,
        )
        print(extracted)
    elif args.extract_all_directory:
        for extracted in extract_all_regular_files(
            archive,
            args.extract_all_directory,
            max_member_bytes=args.max_extracted_bytes,
            max_total_bytes=args.max_total_extracted_bytes,
            max_members=args.max_members,
        ):
            print(extracted)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
