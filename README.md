# Muchat — chat privado da MuhBianco em chat.muhbianco.com.br
#
# Caixa preta: Stoat (ex-Revolt) + LiveKit neste repo.
# Login nativo. Contas novas só com convite de instância.

Este repositório é o overlay da hel1. O compose upstream vem de
https://github.com/stoatchat/self-hosted na hora do bootstrap.

## Isolamento

- Rede overlay `stoat-net` (não é `chatbot-net`).
- Sem ForwardAuth e sem Discord na frente do chat.
- Cadastro: `invite_only = true` no `Revolt.toml`.
- Primogênito da instância: `contato@muhbianco.com.br` (`privileged: true`).

## Convites de conta

Não é o convite de servidor do app. É um código em `account_invites`:

```bash
bash /usr/src/muchat/scripts/create-invite.sh
# ou: bash /usr/src/muchat/scripts/create-invite.sh codigo-amigavel
```

A pessoa abre o link `/login/create/<codigo>` (ou cola o código no campo Invite).

## VPS

```bash
git clone git@github.com:muhbianco/muchat.git /usr/src/muchat
bash /usr/src/muchat/scripts/bootstrap.sh
docker network create --driver overlay --attachable stoat-net || true
cd /usr/src/stoat
docker compose -p stoat up -d --remove-orphans
```

Traefik precisa estar na rede `stoat-net`. O `dynamic_conf.yaml` usa o
fragmento em `traefik/chat.yaml` (router `Host(chat.muhbianco.com.br)`),
sem apagar o router `api.dev.muhbianco.com.br`.

Portas de mídia no host: TCP 7881, UDP 3478, UDP 50000-50100.

Secrets (`secrets.env`, `.env`, `livekit.yml`) ficam só na VPS.
