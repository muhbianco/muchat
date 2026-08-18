"""Cria convites de conta Stoat. Só na loopback; a API pública autentica na api-agents."""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://database:27017")
INVITE_SECRET = os.environ.get("MUCHAT_INVITE_SECRET", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://chat.muhbianco.com.br").rstrip("/")
LISTEN_PORT = int(os.environ.get("INVITE_PORT", "8091"))
CODE_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
MAX_COUNT = 10


def _db():
    from pymongo import MongoClient

    return MongoClient(MONGO_URL, serverSelectionTimeoutMS=4000)["revolt"]


def _new_code() -> str:
    return secrets.token_hex(8)


def create_invites(*, count: int, code: str | None) -> list[dict[str, str]]:
    if count < 1 or count > MAX_COUNT:
        raise ValueError("count deve ser entre 1 e 10.")
    if code and not CODE_RE.match(code):
        raise ValueError("Código inválido. Use 4–64 caracteres [A-Za-z0-9_-].")
    if code and count != 1:
        raise ValueError("Código customizado só vale para count=1.")

    from pymongo.errors import DuplicateKeyError

    coll = _db()["account_invites"]
    created: list[dict[str, str]] = []
    attempts = 0
    while len(created) < count:
        attempts += 1
        if attempts > 40:
            raise RuntimeError("Não foi possível gerar códigos únicos.")
        value = code if code else _new_code()
        try:
            coll.insert_one({"_id": value, "used": False})
        except DuplicateKeyError:
            if code:
                raise ValueError("Esse código já existe.") from None
            continue
        created.append(
            {
                "code": value,
                "url": f"{PUBLIC_URL}/login/create/{value}",
            }
        )
        if code:
            break
    return created


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        return

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _authorized(self) -> bool:
        if not INVITE_SECRET:
            return False
        got = self.headers.get("X-Muchat-Invite-Secret") or ""
        if len(got) != len(INVITE_SECRET):
            return False
        return secrets.compare_digest(got, INVITE_SECRET)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path in {"/healthz", "/healthz/"}:
            self._send(200, {"ok": True})
            return
        self._send(404, {"error": "not_found"})

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in {"/invites", "/invites/"}:
            self._send(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length > 4096:
            self._send(413, {"error": "payload_too_large"})
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"error": "invalid_json"})
            return
        if not isinstance(data, dict):
            self._send(400, {"error": "invalid_json"})
            return
        count = data.get("count", 1)
        code = data.get("code")
        if isinstance(code, str):
            code = code.strip() or None
        else:
            code = None
        try:
            count_i = int(count)
        except (TypeError, ValueError):
            self._send(400, {"error": "invalid_count", "message": "count deve ser um inteiro."})
            return
        try:
            invites = create_invites(count=count_i, code=code)
        except ValueError as exc:
            self._send(400, {"error": "invalid_request", "message": str(exc)})
            return
        except RuntimeError as exc:
            self._send(500, {"error": "invite_failed", "message": str(exc)})
            return
        except Exception as exc:
            print(f"invite backend error: {exc}", file=sys.stderr)
            self._send(502, {"error": "invite_backend_unavailable"})
            return
        self._send(200, {"invites": invites})


def main() -> None:
    if not INVITE_SECRET:
        raise SystemExit("MUCHAT_INVITE_SECRET is required")
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
