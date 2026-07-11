#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
import urllib.error
from email.message import Message
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).with_name("github_artifact_download.py")
spec = importlib.util.spec_from_file_location("github_artifact_download", MODULE_PATH)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FakeResponse:
    def __init__(self, payload: bytes, *, content_length: int | None = None):
        self.payload = payload
        self.headers = Message()
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def read(self, amount: int | None = None) -> bytes:
        if amount is None:
            return self.payload
        return self.payload[:amount]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class RedirectingOpener:
    def __init__(self, location: str):
        self.location = location
        self.requests = []

    def open(self, request, timeout=0):
        self.requests.append(request)
        headers = Message()
        headers["Location"] = self.location
        raise urllib.error.HTTPError(
            request.full_url,
            302,
            "Found",
            headers,
            None,
        )


def header_map(request) -> dict[str, str]:
    return {key.lower(): value for key, value in request.header_items()}


def test_redirect_strips_credentials() -> None:
    opener = RedirectingOpener("https://storage.example.test/signed/artifact.zip?sig=abc")
    storage_requests = []

    def fake_urlopen(request, timeout=0):
        storage_requests.append(request)
        return FakeResponse(b"ZIP-BYTES", content_length=9)

    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "artifact.zip"
        with mock.patch.object(module.urllib.request, "build_opener", return_value=opener), mock.patch.object(
            module.urllib.request, "urlopen", side_effect=fake_urlopen
        ):
            module.download_artifact(
                "LifeLoggerAI/asset-factory",
                123,
                "run-scoped-secret",
                output,
                max_bytes=100,
            )

        assert output.read_bytes() == b"ZIP-BYTES"

    assert len(opener.requests) == 1
    api_headers = header_map(opener.requests[0])
    assert api_headers["authorization"] == "Bearer run-scoped-secret"
    assert opener.requests[0].full_url.startswith("https://api.github.com/")

    assert len(storage_requests) == 1
    storage_headers = header_map(storage_requests[0])
    assert "authorization" not in storage_headers
    assert "x-github-api-version" not in storage_headers
    assert "cookie" not in storage_headers
    assert storage_requests[0].full_url.startswith("https://storage.example.test/")


def test_non_https_redirect_is_rejected() -> None:
    opener = RedirectingOpener("http://storage.example.test/artifact.zip")
    with tempfile.TemporaryDirectory() as directory, mock.patch.object(
        module.urllib.request, "build_opener", return_value=opener
    ), mock.patch.object(module.urllib.request, "urlopen") as redirected:
        try:
            module.download_artifact(
                "LifeLoggerAI/asset-factory",
                123,
                "secret",
                Path(directory) / "artifact.zip",
            )
        except RuntimeError as exc:
            assert "HTTPS" in str(exc)
        else:
            raise AssertionError("non-HTTPS redirect was accepted")
        redirected.assert_not_called()


def test_byte_ceiling_is_enforced() -> None:
    opener = RedirectingOpener("https://storage.example.test/artifact.zip")

    def fake_urlopen(request, timeout=0):
        return FakeResponse(b"0123456789", content_length=10)

    with tempfile.TemporaryDirectory() as directory, mock.patch.object(
        module.urllib.request, "build_opener", return_value=opener
    ), mock.patch.object(module.urllib.request, "urlopen", side_effect=fake_urlopen):
        try:
            module.download_artifact(
                "LifeLoggerAI/asset-factory",
                123,
                "secret",
                Path(directory) / "artifact.zip",
                max_bytes=5,
            )
        except RuntimeError as exc:
            assert "byte ceiling" in str(exc)
        else:
            raise AssertionError("oversized artifact was accepted")


def test_json_api_rejects_redirects() -> None:
    opener = RedirectingOpener("https://storage.example.test/not-json")
    with mock.patch.object(module.urllib.request, "build_opener", return_value=opener):
        try:
            module.github_api_json("https://api.github.com/example", "secret")
        except RuntimeError as exc:
            assert "unexpected redirect" in str(exc)
        else:
            raise AssertionError("JSON API redirect was accepted")


def main() -> int:
    test_redirect_strips_credentials()
    test_non_https_redirect_is_rejected()
    test_byte_ceiling_is_enforced()
    test_json_api_rejects_redirects()
    print("PASS GitHub artifact redirect credential isolation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
