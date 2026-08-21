"""Menu linear do bot de convites. Sem I/O — só o próximo passo e o texto."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,64}$")
CODE_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")
QUOTA = 2

MENU_TEXT = (
    "Oi! Posso te ajudar a convidar até 2 amigos pro Muchat.\n"
    "\n"
    "1. Gerar convite\n"
    "2. Ver convites\n"
    "3. Apagar convite não usado\n"
    "\n"
    "Manda o número da opção. `menu` volta aqui; `cancelar` aborta."
)


class Step(str, Enum):
    MENU = "menu"
    GENERATE_HOW = "generate_how"
    WAIT_EMAIL = "wait_email"
    WAIT_DELETE = "wait_delete"


class Action(str, Enum):
    REPLY = "reply"
    CREATE_CHAT = "create_chat"
    CREATE_EMAIL = "create_email"
    LIST = "list"
    DELETE = "delete"


@dataclass
class Session:
    step: Step = Step.MENU
    unused: list[dict[str, object]] = field(default_factory=list)


@dataclass(frozen=True)
class Outcome:
    session: Session
    action: Action
    text: str | None = None
    email: str | None = None
    code: str | None = None


def _norm(text: str) -> str:
    return " ".join((text or "").strip().split())


def _lower(text: str) -> str:
    return _norm(text).lower()


def start(quota_line: str | None = None) -> Outcome:
    body = MENU_TEXT if not quota_line else f"{quota_line}\n\n{MENU_TEXT}"
    return Outcome(session=Session(), action=Action.REPLY, text=body)


def format_quota(invites: list[dict[str, object]]) -> str:
    total = len(invites)
    unused = sum(1 for item in invites if not item.get("used"))
    remaining = max(0, QUOTA - total)
    return (
        f"Você tem {total} de {QUOTA} convites."
        f" {unused} ainda não usado(s). {remaining} vaga(s) livre(s)."
    )


def format_list(invites: list[dict[str, object]]) -> str:
    if not invites:
        return "Você ainda não gerou convite. Manda `1` pra criar um."
    lines = [format_quota(invites), ""]
    for index, item in enumerate(invites, start=1):
        status = "usado" if item.get("used") else "ativo"
        email = str(item.get("email") or "").strip()
        extra = f" · {email}" if email else ""
        lines.append(f"{index}. `{item.get('code')}` — {status}{extra}")
        lines.append(str(item.get("url") or ""))
    return "\n".join(lines).strip()


def handle(session: Session, text: str) -> Outcome:
    raw = _norm(text)
    lowered = _lower(text)
    if lowered in {"menu", "oi", "olá", "ola", "inicio", "início"}:
        return start()
    if lowered in {"cancelar", "cancela", "sair"}:
        return start("Beleza, cancelei.")

    if session.step is Step.MENU:
        return _from_menu(session, lowered)
    if session.step is Step.GENERATE_HOW:
        return _from_generate_how(session, lowered)
    if session.step is Step.WAIT_EMAIL:
        return _from_email(session, raw)
    if session.step is Step.WAIT_DELETE:
        return _from_delete(session, raw, lowered)
    return start()


def _from_menu(session: Session, lowered: str) -> Outcome:
    if lowered in {"1", "gerar", "gerar convite", "novo"}:
        nxt = Session(step=Step.GENERATE_HOW)
        return Outcome(
            session=nxt,
            action=Action.REPLY,
            text=(
                "Como você quer entregar o convite?\n"
                "\n"
                "1. Código aqui no chat\n"
                "2. E-mail pro amigo"
            ),
        )
    if lowered in {"2", "ver", "listar", "ativos", "convites"}:
        return Outcome(session=session, action=Action.LIST)
    if lowered in {"3", "apagar", "deletar", "remover"}:
        return Outcome(
            session=Session(step=Step.WAIT_DELETE),
            action=Action.LIST,
        )
    return Outcome(session=session, action=Action.REPLY, text=MENU_TEXT)


def _from_generate_how(session: Session, lowered: str) -> Outcome:
    if lowered in {"1", "chat", "codigo", "código", "aqui"}:
        return Outcome(session=Session(), action=Action.CREATE_CHAT)
    if lowered in {"2", "email", "e-mail"}:
        return Outcome(
            session=Session(step=Step.WAIT_EMAIL),
            action=Action.REPLY,
            text="Manda o e-mail do amigo.",
        )
    return Outcome(
        session=session,
        action=Action.REPLY,
        text="Manda `1` pra código no chat ou `2` pra e-mail.",
    )


def _from_email(session: Session, raw: str) -> Outcome:
    email = raw.strip().lower()
    if not EMAIL_RE.match(email):
        return Outcome(
            session=session,
            action=Action.REPLY,
            text="Esse e-mail não parece válido. Tenta de novo ou manda `cancelar`.",
        )
    return Outcome(session=Session(), action=Action.CREATE_EMAIL, email=email)


def _from_delete(session: Session, raw: str, lowered: str) -> Outcome:
    unused = [item for item in session.unused if not item.get("used")]
    if lowered.isdigit():
        index = int(lowered)
        if 1 <= index <= len(unused):
            code = str(unused[index - 1].get("code") or "")
            return Outcome(session=Session(), action=Action.DELETE, code=code)
    if CODE_RE.match(raw):
        return Outcome(session=Session(), action=Action.DELETE, code=raw)
    return Outcome(
        session=session,
        action=Action.REPLY,
        text="Manda o número da lista ou o código. `cancelar` aborta.",
    )
