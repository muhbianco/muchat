"""Cliente mínimo Stoat: REST com X-Bot-Token + WebSocket protocolo v1."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import urlencode

import httpx
import websockets

log = logging.getLogger("invite-bot")

OnMessage = Callable[[dict[str, Any]], Awaitable[None]]


class StoatClient:
    def __init__(self, *, api_url: str, ws_url: str, token: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.ws_url = ws_url.rstrip("/")
        self.token = token
        self.user_id = ""
        self.username = ""
        self.channels: dict[str, dict[str, Any]] = {}
        self._ws: Any = None
        self._reconnect = asyncio.Event()

    def _headers(self) -> dict[str, str]:
        return {"X-Bot-Token": self.token, "Accept": "application/json"}

    @property
    def auth_headers(self) -> dict[str, str]:
        return self._headers()


    async def whoami(self, client: httpx.AsyncClient) -> dict[str, Any]:
        response = await client.get(f"{self.api_url}/users/@me", headers=self._headers())
        response.raise_for_status()
        data = response.json()
        self.user_id = str(data.get("_id") or "")
        self.username = str(data.get("username") or "")
        return data

    async def open_dm(self, user_id: str, client: httpx.AsyncClient) -> str:
        response = await client.get(
            f"{self.api_url}/users/{user_id}/dm", headers=self._headers()
        )
        response.raise_for_status()
        data = response.json()
        channel_id = str(data.get("_id") or "")
        if channel_id:
            self.channels[channel_id] = data
        return channel_id

    async def send(self, channel_id: str, content: str, client: httpx.AsyncClient) -> None:
        response = await client.post(
            f"{self.api_url}/channels/{channel_id}/messages",
            json={"content": content[:2000]},
            headers=self._headers(),
        )
        if response.status_code >= 400:
            log.warning(
                "falha ao enviar mensagem status=%s body=%s",
                response.status_code,
                response.text[:200],
            )
            response.raise_for_status()

    def request_reconnect(self) -> None:
        self._reconnect.set()
        ws = self._ws
        if ws is not None:
            asyncio.create_task(ws.close())

    def _remember_channel(self, payload: dict[str, Any]) -> None:
        channel_id = str(payload.get("_id") or payload.get("id") or "")
        if channel_id:
            self.channels[channel_id] = payload

    def is_dm(self, channel_id: str) -> bool:
        info = self.channels.get(channel_id) or {}
        return str(info.get("channel_type") or "") == "DirectMessage"

    def is_mentioned(self, payload: dict[str, Any]) -> bool:
        mentions = payload.get("mentions") or []
        if self.user_id and self.user_id in mentions:
            return True
        content = str(payload.get("content") or "")
        return bool(self.user_id) and f"<@{self.user_id}>" in content

    async def run(self, on_message: OnMessage) -> None:
        backoff = 1.0
        while True:
            self._reconnect.clear()
            try:
                await self._session(on_message)
                backoff = 1.0
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("websocket caiu")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    async def _session(self, on_message: OnMessage) -> None:
        query = urlencode({"version": "1", "format": "json", "token": self.token})
        uri = f"{self.ws_url}?{query}"
        log.info("conectando websocket")
        async with websockets.connect(uri, ping_interval=None, close_timeout=5) as ws:
            self._ws = ws
            ping_task = asyncio.create_task(self._heartbeat(ws))
            try:
                async for raw in ws:
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    await self._dispatch(event, on_message)
            finally:
                ping_task.cancel()
                self._ws = None

    async def _heartbeat(self, ws: Any) -> None:
        while True:
            await asyncio.sleep(30)
            await ws.send(json.dumps({"type": "Ping", "data": 0}))

    async def _dispatch(self, event: dict[str, Any], on_message: OnMessage) -> None:
        kind = event.get("type")
        if kind == "Bulk":
            for item in event.get("v") or []:
                if isinstance(item, dict):
                    await self._dispatch(item, on_message)
            return
        if kind == "Ping":
            if self._ws is not None:
                await self._ws.send(json.dumps({"type": "Pong", "data": event.get("data", 0)}))
            return
        if kind in {"Pong", "Authenticated"}:
            return
        if kind == "Ready":
            for channel in event.get("channels") or []:
                if isinstance(channel, dict):
                    self._remember_channel(channel)
            log.info("ready channels=%s", len(self.channels))
            return
        if kind == "ChannelCreate":
            self._remember_channel(event)
            return
        if kind == "Message":
            await on_message(event)


async def send_email(
    *,
    url: str,
    secret: str,
    to: str,
    inviter_name: str,
    invite_url: str,
    code: str,
    client: httpx.AsyncClient,
) -> None:
    if not url:
        raise RuntimeError("EMAIL_WEBHOOK_URL ausente")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if secret:
        headers["Authorization"] = secret
    response = await client.post(
        url,
        json={
            "type": "muchat_invite",
            "to": to,
            "inviter_name": inviter_name,
            "invite_url": invite_url,
            "code": code,
            "subject": "Você foi convidado para o Muchat",
        },
        headers=headers,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"n8n {response.status_code}: {response.text[:200]}")
