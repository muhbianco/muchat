"""SSO Discord → sessão Stoat. Identidade vem dos headers do Traefik ForwardAuth."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import httpx

STOAT_API = os.environ.get("STOAT_API_URL", "http://api:14702").rstrip("/")
SSO_SECRET = os.environ.get("SSO_SECRET", "")
LISTEN_PORT = int(os.environ.get("SSO_PORT", "8090"))

_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


def _password(discord_id: str) -> str:
    digest = hmac.new(
        SSO_SECRET.encode("utf-8"),
        f"stoat:{discord_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"Mc.{digest}"


def _email(discord_id: str, header_email: str) -> str:
    raw = (header_email or "").strip().lower()
    if raw and "@" in raw and not raw.endswith("@users.chat.muhbianco.com.br"):
        return raw
    return f"{discord_id}@users.chat.muhbianco.com.br"


def _username(name: str, discord_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]", "", name or "")[:20]
    if len(cleaned) < 2:
        cleaned = f"u{discord_id[-10:]}"
    return cleaned


def _headers(token: str) -> dict[str, str]:
    return {"X-Session-Token": token, "Content-Type": "application/json"}


def _ensure_account(discord_id: str, email: str, name: str) -> dict[str, str]:
    password = _password(discord_id)
    username = _username(name, discord_id)
    with httpx.Client(timeout=_TIMEOUT) as client:
        login = client.post(
            f"{STOAT_API}/auth/session/login",
            json={"email": email, "password": password, "friendly_name": "muchat-sso"},
        )
        if login.status_code >= 400:
            created = client.post(
                f"{STOAT_API}/auth/account/create",
                json={"email": email, "password": password},
            )
            if created.status_code >= 400 and created.status_code not in {409, 403}:
                raise RuntimeError(f"create failed: {created.status_code} {created.text[:300]}")
            login = client.post(
                f"{STOAT_API}/auth/session/login",
                json={
                    "email": email,
                    "password": password,
                    "friendly_name": "muchat-sso",
                },
            )
        if login.status_code >= 400:
            raise RuntimeError(f"login failed: {login.status_code} {login.text[:300]}")
        body = login.json()
        if body.get("result") not in (None, "Success") and "token" not in body:
            raise RuntimeError(f"login unexpected: {body}")
        token = str(body.get("token") or "")
        user_id = str(body.get("user_id") or "")
        session_id = str(body.get("_id") or "")
        if not token or not user_id:
            raise RuntimeError(f"session missing fields: {body}")

        onboard = client.get(f"{STOAT_API}/onboard/hello", headers=_headers(token))
        needs = False
        if onboard.status_code < 400:
            payload = onboard.json()
            needs = bool(payload.get("onboarding") is True)
        if needs:
            for suffix in ("", discord_id[-4:], secrets.token_hex(2)):
                candidate = username if not suffix else f"{username[:16]}{suffix}"
                done = client.post(
                    f"{STOAT_API}/onboard/complete",
                    headers=_headers(token),
                    json={"username": candidate},
                )
                if done.status_code < 400:
                    break
        return {
            "_id": session_id,
            "token": token,
            "user_id": user_id,
            "name": "muchat-sso",
        }


def _page(session: dict[str, str] | None, error: str | None) -> bytes:
    session_json = json.dumps(session or {}, ensure_ascii=True)
    err = (error or "").replace("<", "")
    html = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Entrando no Muchat</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background:#0f1115; color:#e8eaed;
           display:grid; place-items:center; min-height:100vh; margin:0; }}
  </style>
</head>
<body>
  <p id="msg">Entrando…</p>
  <script type="application/json" id="session">{session_json}</script>
  <script>
    const err = {json.dumps(err)};
    const session = JSON.parse(document.getElementById("session").textContent || "{{}}");
    const msg = document.getElementById("msg");
    if (err) {{
      msg.textContent = err;
    }} else if (!session.token) {{
      msg.textContent = "Sem sessão. Recarregue após o Discord.";
    }} else {{
      try {{
        localStorage.setItem("session", JSON.stringify(session));
        const packed = {{
          sessions: {{ [session.user_id]: session }},
          current: session.user_id,
          active: session.user_id,
        }};
        localStorage.setItem("auth", JSON.stringify(packed));
        localStorage.setItem("state", JSON.stringify({{ auth: packed }}));
      }} catch (e) {{}}
      const req = indexedDB.open("localforage", 2);
      req.onupgradeneeded = () => {{
        const db = req.result;
        if (!db.objectStoreNames.contains("keyvaluepairs")) {{
          db.createObjectStore("keyvaluepairs");
        }}
      }};
      req.onsuccess = () => {{
        try {{
          const db = req.result;
          const name = db.objectStoreNames.contains("keyvaluepairs")
            ? "keyvaluepairs" : db.objectStoreNames[0];
          if (!name) {{ location.replace("/"); return; }}
          const tx = db.transaction(name, "readwrite");
          const store = tx.objectStore(name);
          store.put(session, "session");
          store.put({{ [session.user_id]: session }}, "sessions");
          store.put(session.user_id, "current");
          tx.oncomplete = () => location.replace("/");
          tx.onerror = () => location.replace("/");
        }} catch (e) {{
          location.replace("/");
        }}
      }};
      req.onerror = () => location.replace("/");
      setTimeout(() => location.replace("/"), 1200);
    }}
  </script>
</body>
</html>"""
    return html.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        return

    def _send(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path not in {"/sso", "/sso/", "/healthz"}:
            self._send(404, b"not found")
            return
        if path == "/healthz":
            self._send(200, b"ok")
            return
        if not SSO_SECRET:
            self._send(500, _page(None, "SSO_SECRET ausente."))
            return
        discord_id = (self.headers.get("X-Chat-Discord-Id") or "").strip()
        email = self.headers.get("X-Chat-Email") or ""
        name = self.headers.get("X-Chat-Name") or ""
        if not discord_id:
            self._send(401, _page(None, "Identidade Discord ausente. Entre de novo."))
            return
        try:
            session = _ensure_account(discord_id, _email(discord_id, email), name)
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError) as exc:
            self._send(502, _page(None, f"Falha ao abrir o chat: {exc}"))
            return
        self._send(200, _page(session, None))


def main() -> None:
    if not SSO_SECRET:
        raise SystemExit("SSO_SECRET is required")
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
