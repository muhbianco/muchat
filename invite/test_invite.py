"""Testes do gerador de convites (validação, sem Mongo)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.setdefault("MUCHAT_INVITE_SECRET", "unit-test-secret")

from invite import (  # noqa: E402
    InviteError,
    USER_QUOTA,
    create_invites,
    delete_unused,
    list_invites,
)


class _Coll:
    def __init__(self) -> None:
        self.docs: dict[str, dict] = {}

    def count_documents(self, query: dict) -> int:
        owner = query.get("created_by")
        return sum(1 for doc in self.docs.values() if doc.get("created_by") == owner)

    def insert_one(self, doc: dict) -> None:
        key = doc["_id"]
        if key in self.docs:
            raise RuntimeError("duplicate")
        self.docs[key] = dict(doc)

    def find(self, query: dict):
        owner = query.get("created_by")
        rows = [doc for doc in self.docs.values() if doc.get("created_by") == owner]
        rows.sort(key=lambda item: str(item.get("created_at") or ""))
        return iter(rows)

    def find_one(self, query: dict) -> dict | None:
        return self.docs.get(query["_id"])

    def delete_one(self, query: dict) -> MagicMock:
        key = query["_id"]
        doc = self.docs.get(key)
        result = MagicMock()
        if doc is None:
            result.deleted_count = 0
            return result
        if query.get("created_by") and doc.get("created_by") != query["created_by"]:
            result.deleted_count = 0
            return result
        if "used" in query and bool(doc.get("used")) != bool(query["used"]):
            result.deleted_count = 0
            return result
        del self.docs[key]
        result.deleted_count = 1
        return result


class InviteTests(unittest.TestCase):
    def test_count_bounds(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=0, code=None)
        with self.assertRaises(ValueError):
            create_invites(count=11, code=None)

    def test_custom_code_requires_count_one(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=2, code="abcde")

    def test_owned_requires_count_one(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=2, code=None, created_by="01FAKEUSERID00000000000001")

    def test_bad_code(self) -> None:
        with self.assertRaises(ValueError):
            create_invites(count=1, code="no spaces!")

    @patch("invite._coll")
    def test_inserts_random_codes(self, coll_fn: MagicMock) -> None:
        coll = _Coll()
        coll_fn.return_value = coll
        created = create_invites(count=2, code=None)
        self.assertEqual(len(created), 2)
        self.assertTrue(all(str(item["url"]).startswith("https://") for item in created))
        self.assertEqual(len(coll.docs), 2)

    @patch("invite._coll")
    def test_quota_blocks_third_owned_invite(self, coll_fn: MagicMock) -> None:
        coll = _Coll()
        coll_fn.return_value = coll
        owner = "01FAKEUSERID00000000000001"
        create_invites(count=1, code=None, created_by=owner)
        create_invites(count=1, code=None, created_by=owner)
        with self.assertRaises(InviteError) as raised:
            create_invites(count=1, code=None, created_by=owner)
        self.assertEqual(raised.exception.error, "quota_exceeded")
        self.assertEqual(raised.exception.extra["limit"], USER_QUOTA)
        self.assertEqual(len(coll.docs), 2)

    @patch("invite._coll")
    def test_list_and_delete_unused(self, coll_fn: MagicMock) -> None:
        coll = _Coll()
        coll_fn.return_value = coll
        owner = "01FAKEUSERID00000000000001"
        created = create_invites(count=1, code=None, created_by=owner, email="a@b.co")
        listed = list_invites(created_by=owner)
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["email"], "a@b.co")
        self.assertFalse(listed[0]["used"])
        code = str(created[0]["code"])
        deleted = delete_unused(code=code, created_by=owner)
        self.assertTrue(deleted["ok"])
        self.assertEqual(list_invites(created_by=owner), [])

    @patch("invite._coll")
    def test_cannot_delete_used_or_foreign(self, coll_fn: MagicMock) -> None:
        coll = _Coll()
        coll_fn.return_value = coll
        owner = "01FAKEUSERID00000000000001"
        other = "01FAKEUSERID00000000000002"
        created = create_invites(count=1, code=None, created_by=owner)
        code = str(created[0]["code"])
        coll.docs[code]["used"] = True
        with self.assertRaises(InviteError) as used:
            delete_unused(code=code, created_by=owner)
        self.assertEqual(used.exception.error, "invite_used")
        coll.docs[code]["used"] = False
        with self.assertRaises(InviteError) as foreign:
            delete_unused(code=code, created_by=other)
        self.assertEqual(foreign.exception.error, "not_found")


if __name__ == "__main__":
    unittest.main()
