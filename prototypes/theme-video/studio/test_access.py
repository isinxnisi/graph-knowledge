import email.message
from importlib.util import find_spec
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from access import CloudflareAccess
from server import Handler


@unittest.skipUnless(find_spec("jwt") and find_spec("cryptography"), "install requirements-access.txt")
class AccessTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from cryptography.hazmat.primitives.asymmetric import rsa
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.access = CloudflareAccess("studio.example.test", "example", "a" * 64)
        cls.access.keys = Mock()
        cls.access.keys.get_signing_key_from_jwt.return_value = SimpleNamespace(key=cls.key.public_key())

    def request(self, method="GET", host=None, origin=None, token=None, **claims):
        handler = Handler.__new__(Handler)
        handler.command = method
        handler.server = SimpleNamespace(access=self.access, server_port=3269)
        handler.headers = email.message.Message()
        handler.headers["Host"] = host or self.access.host
        if origin is not None:
            handler.headers["Origin"] = origin
        if token is None:
            payload = {"iss": self.access.issuer, "aud": [self.access.audience],
                       "sub": "operator", "exp": int(time.time()) + 60, **claims}
            token = self.access.jwt.encode(payload, self.key, algorithm="RS256", headers={"kid": "test"})
        if token:
            handler.headers["Cf-Access-Jwt-Assertion"] = token
        return handler

    def test_local_and_unknown_hosts(self):
        self.assertTrue(self.request(host="localhost:3269", token="").origin_ok())
        self.assertTrue(self.request(host="127.0.0.1:3269", token="").origin_ok())
        self.assertFalse(self.request(host="127.0.0.1:3269", origin=self.access.origin).origin_ok())
        self.assertFalse(self.request(host="other.example.test").origin_ok())

    def test_remote_requires_a_signed_application_token(self):
        self.assertTrue(self.request().origin_ok())
        self.assertFalse(self.request(token="").origin_ok())
        self.assertFalse(self.request(token="bad.token.value").origin_ok())
        handler = self.request()
        valid = handler.headers["Cf-Access-Jwt-Assertion"]
        signing_input, signature = valid.rsplit(".", 1)
        changed = ("A" if signature[0] != "A" else "B") + signature[1:]
        self.assertFalse(self.request(token=f"{signing_input}.{changed}").origin_ok())
        self.assertFalse(self.request(aud=["b" * 64]).origin_ok())
        self.assertFalse(self.request(iss="https://other.cloudflareaccess.com").origin_ok())
        self.assertFalse(self.request(exp=int(time.time()) - 1).origin_ok())
        self.assertFalse(self.request(nbf=int(time.time()) + 60).origin_ok())
        handler = self.request()
        handler.headers["Cf-Access-Jwt-Assertion"] = handler.headers["Cf-Access-Jwt-Assertion"]
        self.assertFalse(handler.origin_ok())

    def test_remote_writes_require_same_https_origin(self):
        self.assertTrue(self.request("POST", origin=self.access.origin).origin_ok())
        self.assertFalse(self.request("POST").origin_ok())
        self.assertFalse(self.request("POST", origin="http://" + self.access.host).origin_ok())
        self.assertFalse(self.request("POST", origin="https://other.example.test").origin_ok())


if __name__ == "__main__":
    unittest.main()
