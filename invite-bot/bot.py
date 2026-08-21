"""Bot Stoat: convites de conta Muchat via api.muhbianco (chave mbk_)."""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import time

import httpx
from pymongo import MongoClient

from flow import Action, Session, Step, format_list, handle, start
from membership import membership_loop, reconcile
from muchat_api import MuchatApi, MuchatApiError
from stoat_client import StoatClient, send_email

log = logging.getLogger("invite-bot")

SESSION_TTL = 10 * 60
HTTP_TIMEOUT = httpx.Timeout(12.0, connect=5.0)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _wait_secrets() -> tuple[str, str]:
    while True:
        token = _env("STOAT_BOT_TOKEN")
        key = _env("MUHBIANCO_API_KEY")
        if token and key:
            return token, key
        log.warning("STOAT_BOT_TOKEN ou MUHBIANCO_API_KEY ausente; esperando")
        time.sleep(15)


class InviteBot:
    def __init__(self) -> None:
        token, api_key = _wait_secrets()
        self.stoat = StoatClient(
            api_url=_env("STOAT_API_URL", "http://api:14702"),
            ws_url=_env("STOAT_WS_URL", "ws://events:14703"),
            token=token,
        )
        self.api = MuchatApi(
            base_url=_env("MUHBIANCO_API_URL", "https://api.muhbianco.com.br"),
            api_key=api_key,
        )
        self.email_url = _env("EMAIL_WEBHOOK_URL")
        self.email_secret = _env("EMAIL_WEBHOOK_SECRET")
        mongo_url = _env("MONGO_URL", "mongodb://database:27017")
        self.mongo = MongoClient(mongo_url, serverSelectionTimeoutMS=4000)
        self.db = self.mongo["revolt"]
        self.sessions: dict[str, tuple[float, Session]] = {}
        self.locks: dict[str, asyncio.Lock] = {}
        self.http: httpx.AsyncClient | None = None

    def _lock(self, user_id: str) -> asyncio.Lock:
        lock = self.locks.get(user_id)
        if lock is None:
            lock = asyncio.Lock()
            self.locks[user_id] = lock
        return lock

    def _session(self, user_id: str) -> Session:
        packed = self.sessions.get(user_id)
        if packed is None or packed[0] < time.monotonic():
            return Session()
        return packed[1]

    def _store(self, user_id: str, session: Session) -> None:
        self.sessions[user_id] = (time.monotonic() + SESSION_TTL, session)

    async def _reply(self, channel_id: str, text: str) -> None:
        assert self.http is not None
        await self.stoat.send(channel_id, text, self.http)

    async def _ensure_dm(self, user_id: str) -> str:
        assert self.http is not None
        return await self.stoat.open_dm(user_id, self.http)

    async def on_message(self, payload: dict) -> None:
        author = str(payload.get("author") or "")
        if not author or author == self.stoat.user_id:
            return
        if payload.get("bot"):
            return
        content = str(payload.get("content") or "").strip()
        if not content:
            return
        channel_id = str(payload.get("channel") or "")
        if not channel_id:
            return
        if self.stoat.is_dm(channel_id):
            await self._handle_dm(author, channel_id, content)
            return
        if self.stoat.is_mentioned(payload):
            try:
                dm_id = await self._ensure_dm(author)
                await self._reply(
                    channel_id,
                    "Te chamei no privado — o convite fica só entre a gente.",
                )
                outcome = start()
                self._store(author, outcome.session)
                await self._reply(dm_id, outcome.text or "")
            except Exception:
                log.exception("falha ao abrir DM")

    async def _handle_dm(self, user_id: str, channel_id: str, content: str) -> None:
        async with self._lock(user_id):
            session = self._session(user_id)
            outcome = handle(session, content)
            self._store(user_id, outcome.session)
            try:
                if outcome.action is Action.REPLY:
                    await self._reply(channel_id, outcome.text or "")
                    return
                if outcome.action is Action.LIST:
                    await self._do_list(
                        user_id,
                        channel_id,
                        for_delete=outcome.session.step is Step.WAIT_DELETE,
                    )
                    return
                if outcome.action is Action.CREATE_CHAT:
                    await self._do_create(user_id, channel_id, email=None)
                    return
                if outcome.action is Action.CREATE_EMAIL:
                    await self._do_create(user_id, channel_id, email=outcome.email)
                    return
                if outcome.action is Action.DELETE:
                    await self._do_delete(user_id, channel_id, outcome.code or "")
            except MuchatApiError as exc:
                await self._reply(channel_id, self._api_error_text(exc))
            except Exception:
                log.exception("falha no fluxo de convite")
                await self._reply(
                    channel_id, "Algo falhou aqui. Tenta de novo daqui a pouco."
                )

    def _api_error_text(self, exc: MuchatApiError) -> str:
        if exc.error == "muchat_invite_quota":
            return (
                "Você já usou seus 2 convites. "
                "Apague um que ainda não foi usado pra liberar vaga."
            )
        if exc.error == "invite_used":
            return "Esse já foi usado — não dá pra apagar."
        if exc.status == 404:
            return "Não achei esse convite."
        return "Não consegui falar com a API agora. Tenta de novo em instantes."

    async def _do_list(self, user_id: str, channel_id: str, *, for_delete: bool) -> None:
        assert self.http is not None
        invites = await self.api.list_for_user(created_by=user_id, client=self.http)
        if for_delete:
            unused = [item for item in invites if not item.get("used")]
            session = Session(step=Step.WAIT_DELETE, unused=unused)
            self._store(user_id, session)
            if not unused:
                await self._reply(channel_id, "Não tem convite parado pra apagar.")
                self._store(user_id, Session())
                return
            lines = ["Qual você quer apagar? Manda o número ou o código.", ""]
            for index, item in enumerate(unused, start=1):
                lines.append(f"{index}. `{item.get('code')}`")
                lines.append(str(item.get("url") or ""))
            await self._reply(channel_id, "\n".join(lines).strip())
            return
        await self._reply(channel_id, format_list(invites))

    async def _do_create(
        self, user_id: str, channel_id: str, *, email: str | None
    ) -> None:
        assert self.http is not None
        item = await self.api.create(
            created_by=user_id, email=email, client=self.http
        )
        code = str(item.get("code") or "")
        url = str(item.get("url") or "")
        if email:
            try:
                await send_email(
                    url=self.email_url,
                    secret=self.email_secret,
                    to=email,
                    inviter_name=await self._display_name(user_id),
                    invite_url=url,
                    code=code,
                    client=self.http,
                )
                await self._reply(
                    channel_id,
                    f"Convite enviado pra {email}.\nSe não chegar, o link é:\n{url}",
                )
            except Exception:
                log.exception("falha no e-mail n8n")
                await self._reply(
                    channel_id,
                    "O e-mail não saiu, mas o convite existe. Manda este link:\n"
                    f"{url}",
                )
            return
        await self._reply(
            channel_id,
            "Pronto. Quem for usar entra neste link (vale uma conta):\n"
            f"{url}",
        )

    async def _display_name(self, user_id: str) -> str:
        assert self.http is not None
        try:
            response = await self.http.get(
                f"{self.stoat.api_url}/users/{user_id}",
                headers=self.stoat.auth_headers,
            )
            if response.status_code == 200:
                data = response.json()
                name = str(data.get("display_name") or data.get("username") or "").strip()
                if name:
                    return name
        except Exception:
            log.exception("falha ao ler nome do usuario")
        return "alguém no Muchat"

    async def _do_delete(self, user_id: str, channel_id: str, code: str) -> None:
        assert self.http is not None
        if not code:
            await self._reply(channel_id, "Não entendi qual convite apagar.")
            return
        await self.api.delete_unused(code=code, created_by=user_id, client=self.http)
        await self._reply(channel_id, f"Apaguei `{code}`. Essa vaga ficou livre de novo.")

    async def run(self) -> None:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s %(message)s",
        )
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as http:
            self.http = http
            me = await self.stoat.whoami(http)
            log.info("bot autenticado id=%s user=%s", self.stoat.user_id, self.stoat.username)
            if not self.stoat.user_id:
                raise SystemExit("users/@me não devolveu id")

            added = reconcile(self.db, self.stoat.user_id)
            if added:
                log.info("backfill de membership: %s servidores", added)

            def on_join(added_later: int) -> None:
                log.info("novos servidores=%s; reconectando websocket", added_later)
                self.stoat.request_reconnect()

            member_task = asyncio.create_task(
                membership_loop(
                    db=self.db,
                    bot_user_id=self.stoat.user_id,
                    interval=30.0,
                    on_join=on_join,
                    sleep=asyncio.sleep,
                )
            )
            try:
                log.info("hello %s", me.get("username"))
                await self.stoat.run(self.on_message)
            finally:
                member_task.cancel()
                self.http = None


def main() -> None:
    bot = InviteBot()

    def _stop(*_: object) -> None:
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _stop)
    asyncio.run(bot.run())


if __name__ == "__main__":
    main()
