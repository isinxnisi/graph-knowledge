"""Authenticate the optional HTTPS entry point through Cloudflare Access."""
import json
import re


class CloudflareAccess:
    def __init__(self, host, team, audience):
        if not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+", host):
            raise ValueError("Expected the external hostname without a scheme or port")
        if not re.fullmatch(r"[a-z0-9-]+", team) or not re.fullmatch(r"[a-f0-9]{64}", audience):
            raise ValueError("Expected a Cloudflare Access team name and application audience")
        import jwt
        if "RS256" not in jwt.algorithms.get_default_algorithms():
            raise RuntimeError("Cloudflare Access requires PyJWT with the crypto extra")

        self.host = host
        self.origin = f"https://{host}"
        self.issuer = f"https://{team}.cloudflareaccess.com"
        self.audience = audience
        self.jwt = jwt
        self.keys = jwt.PyJWKClient(f"{self.issuer}/cdn-cgi/access/certs", timeout=4)

    @classmethod
    def load(cls, folder):
        try:
            config = (folder / "access.json").read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        return cls(**json.loads(config))

    def identity(self, headers, method):
        origins = headers.get_all("Origin", [])
        if origins != [self.origin] and (origins or method == "POST"):
            return None
        tokens = headers.get_all("Cf-Access-Jwt-Assertion", [])
        if len(tokens) != 1 or not tokens[0] or len(tokens[0]) > 8192:
            return None
        try:
            signing_key = self.keys.get_signing_key_from_jwt(tokens[0])
            claims = self.jwt.decode(tokens[0], signing_key.key, algorithms=["RS256"], issuer=self.issuer,
                            audience=self.audience, options={"require": ["aud", "iss", "exp", "sub"]})
        except self.jwt.PyJWTError:
            return None
        return claims["sub"]

    def allows(self, headers, method):
        return self.identity(headers, method) is not None
