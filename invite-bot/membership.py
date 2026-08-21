"""Coloca o bot como membro de todos os servidores Stoat (atuais e futuros)."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

from bson import Int64
from pymongo.collection import Collection
from pymongo.database import Database

log = logging.getLogger("invite-bot")


def pending_server_ids(db: Database, bot_user_id: str) -> list[str]:
    servers = [str(doc["_id"]) for doc in db["servers"].find({}, {"_id": 1})]
    members: Collection = db["server_members"]
    already = {
        str(doc["_id"]["server"])
        for doc in members.find({"_id.user": bot_user_id}, {"_id.server": 1})
    }
    return [sid for sid in servers if sid not in already]


def join_servers(db: Database, bot_user_id: str, server_ids: list[str]) -> int:
    if not server_ids:
        return 0
    members: Collection = db["server_members"]
    now_ms = Int64(int(time.time() * 1000))
    joined = 0
    for server_id in server_ids:
        result = members.update_one(
            {"_id": {"server": server_id, "user": bot_user_id}},
            {
                "$setOnInsert": {
                    "_id": {"server": server_id, "user": bot_user_id},
                    "joined_at": now_ms,
                }
            },
            upsert=True,
        )
        if result.upserted_id is not None:
            joined += 1
            log.info("bot entrou no servidor %s", server_id)
    return joined


def reconcile(db: Database, bot_user_id: str) -> int:
    missing = pending_server_ids(db, bot_user_id)
    return join_servers(db, bot_user_id, missing)


async def membership_loop(
    *,
    db: Database,
    bot_user_id: str,
    interval: float,
    on_join: Callable[[int], None],
    sleep,
) -> None:
    while True:
        try:
            added = reconcile(db, bot_user_id)
            if added:
                on_join(added)
        except Exception:
            log.exception("falha ao reconciliar membership")
        await sleep(interval)
