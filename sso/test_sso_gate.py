"""Testes do gate HMAC (cookie + state + guild). Sem Discord de verdade."""

from __future__ import annotations

import os
import unittest

os.environ.setdefault("SSO_SECRET", "unit-test-secret-not-for-production")
os.environ.setdefault("DISCORD_CLIENT_ID", "111")
os.environ.setdefault("DISCORD_CLIENT_SECRET", "secret")
os.environ.setdefault("DISCORD_SERVER_ID", "222")

from sso import (  # noqa: E402
    GateError,
    _page,
    decode_gate_cookie,
    encode_gate_cookie,
    in_required_guild,
    make_oauth_state,
    verify_oauth_state,
)


class GateTests(unittest.TestCase):
    def test_cookie_roundtrip(self) -> None:
        token = encode_gate_cookie(
            discord_id="99",
            email="a@b.com",
            name="Ada",
            now=1_700_000_000,
        )
        claims = decode_gate_cookie(token, now=1_700_000_000)
        self.assertEqual(claims["sub"], "99")
        self.assertEqual(claims["email"], "a@b.com")
        self.assertEqual(claims["name"], "Ada")

    def test_cookie_expired(self) -> None:
        token = encode_gate_cookie(discord_id="99", email="", name="", now=10)
        with self.assertRaises(GateError):
            decode_gate_cookie(token, now=10 + 8 * 24 * 3600)

    def test_cookie_tampered(self) -> None:
        token = encode_gate_cookie(discord_id="99", email="", name="", now=1_700_000_000)
        with self.assertRaises(GateError):
            decode_gate_cookie(token[:-1] + ("0" if token[-1] != "0" else "1"), now=1_700_000_000)

    def test_oauth_state_roundtrip(self) -> None:
        state = make_oauth_state()
        verify_oauth_state(state)

    def test_oauth_state_bad_sig(self) -> None:
        state = make_oauth_state()
        with self.assertRaises(GateError):
            verify_oauth_state(state[:-2] + "ab")

    def test_sso_page_writes_for_web_auth_store(self) -> None:
        html = _page(
            {"_id": "sess1", "token": "tok", "user_id": "01ABC", "name": "muchat-sso"},
            None,
        ).decode("utf-8")
        self.assertIn("muchat_ok=1", html)
        self.assertIn("JSON.stringify(auth)", html)
        self.assertIn("userId:", html)
        self.assertIn("valid: true", html)
        self.assertIn('.put(raw, "auth")', html)

    def test_guild_membership(self) -> None:
        self.assertTrue(in_required_guild([{"id": "222"}, {"id": "333"}], "222"))
        self.assertFalse(in_required_guild([{"id": "333"}], "222"))
        self.assertFalse(in_required_guild("nope", "222"))


if __name__ == "__main__":
    unittest.main()
