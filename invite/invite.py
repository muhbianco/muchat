"""Cria, lista e apaga convites de conta Stoat. Só na loopback; a API pública autentica na api-agents."""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://database:27017")
INVITE_SECRET = os.environ.get("MUCHAT_INVITE_SECRET", "")
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://chat.muhbianco.com.br").rstrip("/")
LISTEN_PORT = int(os.environ.get("INVITE_PORT", "8091"))
CODE_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
OWNER_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,64}$")
MAX_COUNT = 10
USER_QUOTA = 2


class InviteError(Exception):
    def __init__(self, status: int, error: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status = status
        self.error = error
        self.message = message
        self.extra = extra


def _db():
    from pymongo import MongoClient

    return MongoClient(MONGO_URL, serverSelectionTimeoutMS=4000)["revolt"]


def _coll():
    return _db()["account_invites"]


def _new_code() -> str:
    return secrets.token_hex(8)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_url(code: str) -> str:
    return f"{PUBLIC_URL}/login/create/{code}"


def serialize(doc: dict) -> dict[str, object]:
    code = str(doc["_id"])
    item: dict[str, object] = {
        "code": code,
        "url": _public_url(code),
        "used": bool(doc.get("used")),
    }
    created_at = doc.get("created_at")
    if created_at:
        item["created_at"] = str(created_at)
    created_by = doc.get("created_by")
    if created_by:
        item["created_by"] = str(created_by)
    email = doc.get("email")
    if email:
        item["email"] = str(email)
    return item


def ensure_indexes() -> None:
    _coll().create_index("created_by", sparse=True)


def _clean_owner(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise InviteError(400, "invalid_request", "created_by deve ser um texto.")
    owner = value.strip()
    if not owner:
        return None
    if not OWNER_RE.match(owner):
        raise InviteError(400, "invalid_request", "created_by inválido.")
    return owner


def _clean_email(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise InviteError(400, "invalid_request", "e-mail deve ser um texto.")
    email = value.strip().lower()
    if not email:
        return None
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise InviteError(400, "invalid_request", "e-mail inválido.")
    return email


def create_invites(
    *,
    count: int,
    code: str | None,
    created_by: str | None = None,
    email: str | None = None,
) -> list[dict[str, object]]:
    if count < 1 or count > MAX_COUNT:
        raise ValueError("count deve ser entre 1 e 10.")
    if code and not CODE_RE.match(code):
        raise ValueError("Código inválido. Use 4–64 caracteres [A-Za-z0-9_-].")
    if code and count != 1:
        raise ValueError("Código customizado só vale para count=1.")
    if created_by and count != 1:
        raise ValueError("Convite atribuído a um usuário só pode ter count=1.")

    try:
        from pymongo.errors import DuplicateKeyError
    except ImportError:  # unittest sem o driver
        DuplicateKeyError = type("DuplicateKeyError", (Exception,), {})

    coll = _coll()
    if created_by:
        used = coll.count_documents({"created_by": created_by})
        if used >= USER_QUOTA:
            raise InviteError(
                409,
                "quota_exceeded",
                "Este usuário já atingiu o limite de 2 convites.",
                used=used,
                limit=USER_QUOTA,
            )

    created: list[dict[str, object]] = []
    attempts = 0
    while len(created) < count:
        attempts += 1
        if attempts > 40:
            raise RuntimeError("Não foi possível gerar códigos únicos.")
        value = code if code else _new_code()
        doc: dict[str, object] = {"_id": value, "used": False, "created_at": _now()}
        if created_by:
            doc["created_by"] = created_by
        if email:
            doc["email"] = email
        try:
            coll.insert_one(doc)
        except DuplicateKeyError:
            if code:
                raise ValueError("Esse código já existe.") from None
            continue
        if created_by:
            total = coll.count_documents({"created_by": created_by})
            if total > USER_QUOTA:
                coll.delete_one({"_id": value, "used": False})
                raise InviteError(
                    409,
                    "quota_exceeded",
                    "Este usuário já atingiu o limite de 2 convites.",
                    used=total - 1,
                    limit=USER_QUOTA,
                )
        created.append(serialize(doc))
        if code:
            break
    return created


def list_invites(*, created_by: str) -> list[dict[str, object]]:
    rows = list(_coll().find({"created_by": created_by}))
    rows.sort(key=lambda doc: str(doc.get("created_at") or ""))
    return [serialize(doc) for doc in rows]


def delete_unused(*, code: str, created_by: str) -> dict[str, object]:
    if not CODE_RE.match(code):
        raise InviteError(400, "invalid_request", "Código inválido.")
    coll = _coll()
    doc = coll.find_one({"_id": code})
    if doc is None or str(doc.get("created_by") or "") != created_by:
        raise InviteError(404, "not_found", "Convite não encontrado.")
    if doc.get("used"):
        raise InviteError(
            409,
            "invite_used",
            "Esse convite já foi usado e não pode ser apagado.",
        )
    result = coll.delete_one({"_id": code, "created_by": created_by, "used": False})
    if result.deleted_count != 1:
        raise InviteError(409, "invite_used", "Esse convite já foi usado e não pode ser apagado.")
    return {"ok": True, "code": code}


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

    def _read_json(self) -> dict | None:
        length = int(self.headers.get("Content-Length") or "0")
        if length > 4096:
            self._send(413, {"error": "payload_too_large"})
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"error": "invalid_json"})
            return None
        if not isinstance(data, dict):
            self._send(400, {"error": "invalid_json"})
            return None
        return data

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        if path in {"/healthz"}:
            self._send(200, {"ok": True})
            return
        if path != "/invites":
            self._send(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        qs = parse_qs(parsed.query)
        raw_owner = (qs.get("created_by") or [""])[0]
        try:
            owner = _clean_owner(raw_owner)
        except InviteError as exc:
            self._send(exc.status, {"error": exc.error, "message": exc.message, **exc.extra})
            return
        if not owner:
            self._send(400, {"error": "invalid_request", "message": "created_by é obrigatório."})
            return
        try:
            invites = list_invites(created_by=owner)
        except Exception as exc:
            print(f"invite backend error: {exc}", file=sys.stderr)
            self._send(502, {"error": "invite_backend_unavailable"})
            return
        self._send(200, {"invites": invites})

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        prefix = "/invites/"
        if not path.startswith(prefix):
            self._send(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        code = unquote(path[len(prefix) :]).strip()
        qs = parse_qs(parsed.query)
        try:
            owner = _clean_owner((qs.get("created_by") or [""])[0])
            if not owner:
                raise InviteError(400, "invalid_request", "created_by é obrigatório.")
            payload = delete_unused(code=code, created_by=owner)
        except InviteError as exc:
            self._send(exc.status, {"error": exc.error, "message": exc.message, **exc.extra})
            return
        except Exception as exc:
            print(f"invite backend error: {exc}", file=sys.stderr)
            self._send(502, {"error": "invite_backend_unavailable"})
            return
        self._send(200, payload)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/invites":
            self._send(404, {"error": "not_found"})
            return
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        data = self._read_json()
        if data is None:
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
            created_by = _clean_owner(data.get("created_by"))
            email = _clean_email(data.get("email"))
            invites = create_invites(
                count=count_i, code=code, created_by=created_by, email=email
            )
        except InviteError as exc:
            self._send(exc.status, {"error": exc.error, "message": exc.message, **exc.extra})
            return
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
    try:
        ensure_indexes()
    except Exception as exc:
        print(f"invite index warning: {exc}", file=sys.stderr)
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
