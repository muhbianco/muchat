"""Testes do gerador de convites (validação, sem Mongo)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("MUCHAT_INVITE_SECRET", "unit-test-secret")

from invite import create_invites  # noqa: E402


class InviteTests(unittest.TestCase):
    def test_count_bounds(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=0, code=None)
        with self.assertRaises(ValueError):
            create_invites(count=11, code=None)

    def test_custom_code_requires_count_one(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=2, code="abcde")

    def test_bad_code(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=1, code="no spaces!")

    @patch("invite._db")
    def test_inserts_random_codes(self, db_fn: MagicMock) -> None:
        coll = MagicMock()
        db_fn.return_value = {"account_invites": coll}
        try:
            created = create_invites(count=2, code=None)
        except ModuleNotFoundError:
            self.skipTest("pymongo not installed")
        self.assertEqual(len(created), 2)
        self.assertTrue(all(item["url"].startswith("https://") for item in created))
        self.assertEqual(coll.insert_one.call_count, 2)


if __name__ == "__main__":
    unittest.main()
