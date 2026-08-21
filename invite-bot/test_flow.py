"""Testes do menu linear do bot de convites."""

from __future__ import annotations

import unittest

from flow import Action, Session, Step, format_list, handle, start


class FlowTests(unittest.TestCase):
    def test_menu_generate_chat(self) -> None:
        session = start().session
        how = handle(session, "1")
        self.assertEqual(how.session.step, Step.GENERATE_HOW)
        created = handle(how.session, "1")
        self.assertEqual(created.action, Action.CREATE_CHAT)

    def test_email_path(self) -> None:
        session = handle(start().session, "gerar").session
        ask = handle(session, "2")
        self.assertEqual(ask.session.step, Step.WAIT_EMAIL)
        bad = handle(ask.session, "nao-e-email")
        self.assertEqual(bad.action, Action.REPLY)
        self.assertEqual(bad.session.step, Step.WAIT_EMAIL)
        ok = handle(ask.session, "amigo@example.com")
        self.assertEqual(ok.action, Action.CREATE_EMAIL)
        self.assertEqual(ok.email, "amigo@example.com")

    def test_cancel_returns_to_menu(self) -> None:
        session = handle(start().session, "1").session
        out = handle(session, "cancelar")
        self.assertEqual(out.session.step, Step.MENU)

    def test_list_and_delete_by_index(self) -> None:
        listed = handle(start().session, "2")
        self.assertEqual(listed.action, Action.LIST)
        deleting = handle(start().session, "3")
        self.assertEqual(deleting.action, Action.LIST)
        self.assertEqual(deleting.session.step, Step.WAIT_DELETE)
        session = Session(
            step=Step.WAIT_DELETE,
            unused=[{"code": "aaa11111", "used": False}, {"code": "bbb22222", "used": False}],
        )
        picked = handle(session, "2")
        self.assertEqual(picked.action, Action.DELETE)
        self.assertEqual(picked.code, "bbb22222")

    def test_format_list_empty(self) -> None:
        self.assertIn("ainda não gerou", format_list([]))


if __name__ == "__main__":
    unittest.main()
