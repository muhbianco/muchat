"""Muchat gate: Discord (membro do servidor) → cookie host-only → sessão Stoat.

Nada disto vive na api-agents. Traefik ForwardAuth aponta para /forward aqui.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

STOAT_API = os.environ.get("STOAT_API_URL", "http://api:14702").rstrip("/")
SSO_SECRET = os.environ.get("SSO_SECRET", "")
LISTEN_PORT = int(os.environ.get("SSO_PORT", "8090"))
PUBLIC_URL = os.environ.get("PUBLIC_URL", "https://chat.muhbianco.com.br").rstrip("/")
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET", "")
DISCORD_SERVER_ID = os.environ.get("DISCORD_SERVER_ID", "")
DISCORD_REDIRECT_URI = os.environ.get(
    "DISCORD_REDIRECT_URI",
    f"{PUBLIC_URL}/oauth/callback",
)
COOKIE_NAME = "muchat_gate"
IN_COOKIE_NAME = "muchat_in"
COOKIE_MAX_AGE = int(os.environ.get("COOKIE_MAX_AGE", str(7 * 24 * 3600)))
STATE_MAX_AGE = 600
DISCORD_API = "https://discord.com/api/v10"
DISCORD_SCOPES = "identify email guilds"

def _httpx():
    import httpx

    return httpx


class GateError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _secret() -> bytes:
    if not SSO_SECRET:
        raise GateError("SSO_SECRET ausente.")
    return SSO_SECRET.encode("utf-8")


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64url(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def _sign(raw: str) -> str:
    return hmac.new(_secret(), raw.encode("utf-8"), hashlib.sha256).hexdigest()


def make_oauth_state() -> str:
    nonce = secrets.token_urlsafe(24)
    ts = str(int(time.time()))
    raw = f"{nonce}.{ts}"
    return f"{raw}.{_sign(raw)}"


def verify_oauth_state(state: str, *, now: int | None = None) -> None:
    parts = (state or "").split(".")
    if len(parts) != 3:
        raise GateError("Estado OAuth inválido.")
    nonce, ts, sig = parts
    raw = f"{nonce}.{ts}"
    if not hmac.compare_digest(sig, _sign(raw)):
        raise GateError("Estado OAuth inválido.")
    try:
        issued = int(ts)
    except ValueError as exc:
        raise GateError("Estado OAuth inválido.") from exc
    clock = int(time.time() if now is None else now)
    if abs(clock - issued) > STATE_MAX_AGE:
        raise GateError("Login Discord expirou. Tente de novo.")


def encode_gate_cookie(
    *,
    discord_id: str,
    email: str,
    name: str,
    now: int | None = None,
) -> str:
    clock = int(time.time() if now is None else now)
    payload = {
        "sub": discord_id,
        "email": email,
        "name": name,
        "exp": clock + COOKIE_MAX_AGE,
    }
    raw = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    return f"{raw}.{_sign(raw)}"


def decode_gate_cookie(token: str, *, now: int | None = None) -> dict[str, str]:
    parts = (token or "").split(".", 1)
    if len(parts) != 2:
        raise GateError("Sessão inválida.")
    raw, sig = parts
    if not hmac.compare_digest(sig, _sign(raw)):
        raise GateError("Sessão inválida.")
    try:
        payload = json.loads(_unb64url(raw).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise GateError("Sessão inválida.") from exc
    if not isinstance(payload, dict):
        raise GateError("Sessão inválida.")
    clock = int(time.time() if now is None else now)
    try:
        exp = int(payload.get("exp") or 0)
    except (TypeError, ValueError) as exc:
        raise GateError("Sessão inválida.") from exc
    if exp <= clock:
        raise GateError("Sessão expirada.")
    discord_id = str(payload.get("sub") or "").strip()
    if not discord_id:
        raise GateError("Sessão inválida.")
    return {
        "sub": discord_id,
        "email": str(payload.get("email") or ""),
        "name": str(payload.get("name") or ""),
    }


def header_safe(value: str) -> str:
    return re.sub(r"[\r\n]", "", value)[:240]


def in_required_guild(guilds: object, server_id: str) -> bool:
    if not isinstance(guilds, list) or not server_id:
        return False
    wanted = str(server_id)
    return any(
        isinstance(guild, dict) and str(guild.get("id") or "") == wanted
        for guild in guilds
    )


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


def discord_configured() -> bool:
    return bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET and DISCORD_SERVER_ID)


def build_discord_authorize_url(state: str) -> str:
    params = urlencode(
        {
            "client_id": DISCORD_CLIENT_ID,
            "redirect_uri": DISCORD_REDIRECT_URI,
            "response_type": "code",
            "scope": DISCORD_SCOPES,
            "state": state,
        }
    )
    return f"https://discord.com/oauth2/authorize?{params}"


def exchange_discord_code(code: str) -> dict[str, str]:
    if not discord_configured():
        raise GateError("Login Discord não está configurado.")
    httpx = _httpx()
    try:
        with httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            token_res = client.post(
                f"{DISCORD_API}/oauth2/token",
                data={
                    "client_id": DISCORD_CLIENT_ID,
                    "client_secret": DISCORD_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": DISCORD_REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            if token_res.status_code >= 400:
                raise GateError("Falha ao trocar o código do Discord.")
            access_token = token_res.json().get("access_token")
            if not access_token:
                raise GateError("Discord não devolveu access_token.")

            headers = {"Authorization": f"Bearer {access_token}"}
            user_res = client.get(f"{DISCORD_API}/users/@me", headers=headers)
            if user_res.status_code >= 400:
                raise GateError("Falha ao obter o perfil do Discord.")
            data = user_res.json()
            if not isinstance(data, dict):
                raise GateError("Perfil Discord inválido.")

            guilds_res = client.get(f"{DISCORD_API}/users/@me/guilds", headers=headers)
            if guilds_res.status_code >= 400:
                raise GateError("Falha ao listar servidores do Discord.")
            if not in_required_guild(guilds_res.json(), DISCORD_SERVER_ID):
                raise GateError(
                    "Você precisa estar no servidor Discord da MuhBianco para entrar."
                )
    except httpx.HTTPError as exc:
        raise GateError("Falha ao falar com o Discord.") from exc

    discord_id = str(data.get("id") or "").strip()
    if not discord_id:
        raise GateError("Discord não forneceu id de usuário.")
    email = str(data.get("email") or "").strip().lower()
    username = str(data.get("global_name") or data.get("username") or "").strip()
    return {
        "sub": discord_id,
        "email": _email(discord_id, email),
        "name": (username or discord_id)[:120],
    }


def _ensure_account(discord_id: str, email: str, name: str) -> dict[str, str]:
    httpx = _httpx()
    password = _password(discord_id)
    username = _username(name, discord_id)
    with httpx.Client(timeout=httpx.Timeout(20.0, connect=5.0)) as client:
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
                detail = created.text or ""
                already = created.status_code == 500 and "OperationFailed" in detail
                if not already:
                    raise RuntimeError(
                        f"create failed: {created.status_code} {detail[:300]}"
                    )
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
        if not isinstance(body, dict):
            raise RuntimeError("login unexpected: not an object")
        nested = body.get("Success")
        if isinstance(nested, dict):
            body = nested
        if body.get("result") not in (None, "Success") and "token" not in body:
            raise RuntimeError(f"login unexpected: {sorted(body.keys())}")
        token = str(body.get("token") or "")
        user_id = str(body.get("user_id") or body.get("userId") or "")
        session_id = str(body.get("_id") or body.get("id") or "")
        if not token or not user_id:
            raise RuntimeError(f"session missing fields: {sorted(body.keys())}")

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
            "_id": session_id or user_id,
            "token": token,
            "user_id": user_id,
            "name": "muchat-sso",
        }


def _html_shell(title: str, body: str) -> bytes:
    html = f"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background:#0f1115; color:#e8eaed;
           display:grid; place-items:center; min-height:100vh; margin:0; padding:1.5rem; }}
    p {{ max-width: 36rem; line-height: 1.5; text-align: center; }}
    a {{ color: #8ab4ff; }}
  </style>
</head>
<body>
  {body}
</body>
</html>"""
    return html.encode("utf-8")


def _denied_page(message: str) -> bytes:
    safe = (message or "Acesso recusado.").replace("<", "")
    return _html_shell(
        "Muchat",
        f'<p>{safe}</p><p><a href="/oauth/login">Tentar de novo</a></p>',
    )


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
      const auth = {{
        session: {{
          _id: String(session._id || session.user_id || ""),
          token: String(session.token || ""),
          userId: String(session.user_id || ""),
          valid: true,
        }},
      }};
      const go = () => location.replace("/");
      const raw = JSON.stringify(auth);
      const req = indexedDB.open("localforage");
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
          if (!name) {{ go(); return; }}
          const tx = db.transaction(name, "readwrite");
          tx.objectStore(name).put(raw, "auth");
          tx.oncomplete = go;
          tx.onerror = go;
        }} catch (e) {{
          go();
        }}
      }};
      req.onerror = go;
    }}
  </script>
</body>
</html>"""
    return html.encode("utf-8")


def _cookie_from_header(header: str) -> str:
    jar = SimpleCookie()
    try:
        jar.load(header or "")
    except CookieError:
        return ""
    morsel = jar.get(COOKIE_NAME)
    return morsel.value if morsel else ""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        return

    def _send(
        self,
        status: int,
        body: bytes,
        extra: dict[str, str] | None = None,
        cookies: list[str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("X-Content-Type-Options", "nosniff")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _redirect(self, location: str, extra: dict[str, str] | None = None) -> None:
        headers = {"Location": location}
        if extra:
            headers.update(extra)
        self._send(302, b"", extra=headers)

    def _in_cookie_header(self) -> str:
        return (
            f"{IN_COOKIE_NAME}=1; Path=/; HttpOnly; Secure; SameSite=Lax; "
            f"Max-Age={COOKIE_MAX_AGE}"
        )

    def _set_cookie_header(self, token: str) -> str:
        return (
            f"{COOKIE_NAME}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; "
            f"Max-Age={COOKIE_MAX_AGE}"
        )

    def _clear_cookie_header(self) -> str:
        return f"{COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"

    def _identity(self) -> dict[str, str] | None:
        raw = _cookie_from_header(self.headers.get("Cookie") or "")
        if not raw:
            return None
        try:
            return decode_gate_cookie(raw)
        except GateError:
            return None

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/healthz":
            self._send(200, b"ok")
            return

        if path == "/forward":
            self._handle_forward()
            return

        if path in {"/oauth/login", "/oauth/login/"}:
            self._handle_login()
            return

        if path in {"/oauth/callback", "/oauth/callback/"}:
            self._handle_callback(query)
            return

        if path not in {"/sso", "/sso/"}:
            self._send(404, _denied_page("Não encontrado."))
            return

        if not SSO_SECRET:
            self._send(500, _page(None, "SSO_SECRET ausente."))
            return
        identity = self._identity()
        if not identity:
            self._redirect(f"{PUBLIC_URL}/oauth/login")
            return
        try:
            session = _ensure_account(
                identity["sub"],
                _email(identity["sub"], identity.get("email") or ""),
                identity.get("name") or "",
            )
        except Exception as exc:
            print(f"sso account error: {exc}", file=sys.stderr)
            self._send(502, _page(None, "Falha ao abrir o chat. Tente de novo."))
            return
        self._send(200, _page(session, None), cookies=[self._in_cookie_header()])

    def _handle_forward(self) -> None:
        identity = self._identity()
        if not identity:
            extra = None
            if _cookie_from_header(self.headers.get("Cookie") or ""):
                extra = {"Set-Cookie": self._clear_cookie_header()}
            self._redirect(f"{PUBLIC_URL}/oauth/login", extra=extra)
            return
        self.send_response(200)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Chat-Discord-Id", header_safe(identity["sub"]))
        self.send_header("X-Chat-Email", header_safe(identity.get("email") or ""))
        self.send_header("X-Chat-Name", header_safe(identity.get("name") or ""))
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _handle_login(self) -> None:
        if not discord_configured() or not SSO_SECRET:
            self._send(503, _denied_page("Login Discord ainda não está configurado neste chat."))
            return
        try:
            state = make_oauth_state()
        except GateError as exc:
            self._send(500, _denied_page(exc.message))
            return
        self._redirect(build_discord_authorize_url(state))

    def _handle_callback(self, query: dict[str, list[str]]) -> None:
        if query.get("error"):
            self._send(403, _denied_page("O Discord recusou o login."))
            return
        code = (query.get("code") or [""])[0]
        state = (query.get("state") or [""])[0]
        if not code or not state:
            self._send(400, _denied_page("Faltou o código do Discord. Tente entrar de novo."))
            return
        try:
            verify_oauth_state(state)
            profile = exchange_discord_code(code)
            token = encode_gate_cookie(
                discord_id=profile["sub"],
                email=profile["email"],
                name=profile["name"],
            )
        except GateError as exc:
            self._send(403, _denied_page(exc.message))
            return
        except Exception as exc:
            print(f"sso oauth error: {exc}", file=sys.stderr)
            self._send(502, _denied_page("Falha inesperada no login. Tente de novo."))
            return
        self._redirect(
            f"{PUBLIC_URL}/sso",
            extra={"Set-Cookie": self._set_cookie_header(token)},
        )


def main() -> None:
    if not SSO_SECRET:
        raise SystemExit("SSO_SECRET is required")
    if not discord_configured():
        raise SystemExit("DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_SERVER_ID are required")
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
