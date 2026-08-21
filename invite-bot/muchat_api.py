"""Cliente da API pública MuhBianco (chave `mbk_`)."""

from __future__ import annotations

from typing import Any

import httpx

class MuchatApiError(Exception):
    def __init__(self, status: int, error: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.error = error
        self.message = message


class MuchatApi:
    def __init__(self, *, base_url: str, api_key: str) -> None:
        self._base = base_url.rstrip("/")
        self._key = api_key.strip()

    def _headers(self) -> dict[str, str]:
        return {
            "X-API-Key": self._key,
            "Authorization": f"Bearer {self._key}",
            "Accept": "application/json",
        }

    async def _parse(self, response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError:
            body = {}
        if not isinstance(body, dict):
            body = {}
        if response.status_code >= 400:
            raise MuchatApiError(
                response.status_code,
                str(body.get("error") or "http_error"),
                str(body.get("message") or f"HTTP {response.status_code}"),
            )
        return body

    async def create(
        self,
        *,
        created_by: str,
        email: str | None = None,
        client: httpx.AsyncClient,
    ) -> dict[str, Any]:
        payload: dict[str, object] = {"created_by": created_by, "count": 1}
        if email:
            payload["email"] = email
        response = await client.post(
            f"{self._base}/api/latest/muchat/invites",
            json=payload,
            headers=self._headers(),
        )
        body = await self._parse(response)
        invites = body.get("invites")
        if not isinstance(invites, list) or not invites:
            raise MuchatApiError(502, "empty", "A API não devolveu o convite.")
        item = invites[0]
        if not isinstance(item, dict):
            raise MuchatApiError(502, "empty", "A API não devolveu o convite.")
        return item

    async def list_for_user(
        self, *, created_by: str, client: httpx.AsyncClient
    ) -> list[dict[str, Any]]:
        response = await client.get(
            f"{self._base}/api/latest/muchat/invites",
            params={"created_by": created_by},
            headers=self._headers(),
        )
        body = await self._parse(response)
        invites = body.get("invites")
        if not isinstance(invites, list):
            return []
        return [item for item in invites if isinstance(item, dict)]

    async def delete_unused(
        self, *, code: str, created_by: str, client: httpx.AsyncClient
    ) -> None:
        response = await client.delete(
            f"{self._base}/api/latest/muchat/invites/{code}",
            params={"created_by": created_by},
            headers=self._headers(),
        )
        await self._parse(response)
