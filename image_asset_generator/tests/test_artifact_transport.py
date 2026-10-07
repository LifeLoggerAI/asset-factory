"""Actual numeric socket/TLS policy with synthetic DNS and HTTPS transport."""
import socket
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import provider_renderer as renderer
import paid_request_guard as guard


class ArtifactTransportTests(unittest.TestCase):
    def fixture(self, addresses=None, status=200, length=None, body=b"synthetic"):
        reservation = {"envelope": {"job": {"executor": {"artifact_hosts": ["outputs.example.test"]}}}}
        connection = MagicMock(); response = connection.getresponse.return_value
        response.status = status; response.getheader.return_value = length; response.read.return_value = body
        lookup = addresses or [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", 443))]
        return reservation, connection, lookup

    def test_original_tls_host_uses_exactly_one_dns_result_and_numeric_socket(self):
        reservation, connection, lookup = self.fixture()
        with patch.object(renderer.socket, "getaddrinfo", return_value=lookup) as resolve, patch.object(renderer.http.client, "HTTPSConnection", return_value=connection) as https, patch.object(renderer.socket, "socket") as socket_factory, patch.object(guard, "check_admission"), patch.object(guard, "remaining_seconds", return_value=2):
            self.assertEqual(renderer._retrieve_artifact("https://outputs.example.test/a?token=SYNTHETIC", 2, reservation), b"synthetic")
            resolve.assert_called_once_with("outputs.example.test", 443, type=socket.SOCK_STREAM)
            self.assertEqual(https.call_args.args, ("outputs.example.test",))
            connection._create_connection(("different-host.invalid", 443), 1)
            socket_factory.return_value.connect.assert_called_once_with(("1.1.1.1", 443))
            self.assertEqual(connection.request.call_args.args, ("GET", "/a?token=SYNTHETIC"))
            self.assertEqual(connection.request.call_args.kwargs["headers"], {"User-Agent": "urai-protected-artifact/1"})
            response = connection.getresponse.return_value; response.read.assert_called_once_with(67108865)
            connection.close.assert_called_once()

    def test_no_unadmitted_host_or_private_dns_answer_can_create_an_https_socket(self):
        for address in ["127.0.0.1", "10.1.2.3", "100.64.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "224.0.0.1", "::1", "::ffff:7f00:1", "::ffff:101:101", "fc00::1", "fe80::1", "2002:7f00:1::1", "ff02::1"]:
            with self.subTest(address=address):
                family = socket.AF_INET6 if ":" in address else socket.AF_INET
                reservation, connection, lookup = self.fixture([(family, socket.SOCK_STREAM, 6, "", (address, 443))])
                with patch.object(renderer.socket, "getaddrinfo", return_value=lookup), patch.object(renderer.http.client, "HTTPSConnection") as https, patch.object(guard, "check_admission"):
                    with self.assertRaises(guard.PaidRequestUnauthorized): renderer._retrieve_artifact("https://outputs.example.test/a", 2, reservation)
                    https.assert_not_called()
        reservation, _, _ = self.fixture()
        for url in ["http://outputs.example.test/a", "https://foreign.example.test/a", "https://u:p@outputs.example.test/a", "https://outputs.example.test:444/a", "https://outputs.example.test/a#fragment"]:
            with patch.object(renderer.socket, "getaddrinfo") as resolve:
                with self.assertRaises(guard.PaidRequestUnauthorized): renderer._retrieve_artifact(url, 2, reservation)
                resolve.assert_not_called()

    def test_redirect_partial_oversized_and_empty_artifacts_close_without_acceptance(self):
        for status, length, body in [(302, None, b"x"), (206, None, b"x"), (200, "67108865", b"x"), (200, None, b""), (200, "invalid", b"x")]:
            with self.subTest(status=status, length=length):
                reservation, connection, lookup = self.fixture(status=status, length=length, body=body)
                with patch.object(renderer.socket, "getaddrinfo", return_value=lookup), patch.object(renderer.http.client, "HTTPSConnection", return_value=connection), patch.object(guard, "check_admission"), patch.object(guard, "remaining_seconds", return_value=2):
                    with self.assertRaises((guard.PaidRequestUnauthorized, ValueError)): renderer._retrieve_artifact("https://outputs.example.test/a", 2, reservation)
                    connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
