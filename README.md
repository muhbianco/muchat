# Muchat — chat privado em chat.muhbianco.com.br
#
# Marca própria (não é o site MuhBianco). Stoat + LiveKit neste overlay.
# Login nativo. Contas novas só com convite de instância.

Este repositório é o overlay da hel1. O compose upstream vem de
https://github.com/stoatchat/self-hosted na hora do bootstrap.

## Isolamento

- Rede overlay `stoat-net` (não é `chatbot-net`).
- Sem ForwardAuth e sem Discord na frente do chat.
- Cadastro: `invite_only = true` no `Revolt.toml`.
- Primogênito da instância: `contato@muhbianco.com.br` (`privileged: true`).

## Marca e download

- PWA/título: Muchat (`brand/`).
- Windows: `https://chat.muhbianco.com.br/download`

## Convites de conta

Pela API autenticada (admin, escopo `users:write`, JWT ou chave `mbk_`):

`POST https://api.muhbianco.com.br/api/latest/muchat/invites`

Body: `{"count":1}` — devolve o link `/login/create/<codigo>`.

HTTP custom no agente: Bearer = chave `mbk_` da conta admin (não use access token de 15 min).

Na VPS ainda vale:

```bash
bash /usr/src/muchat/scripts/create-invite.sh
```

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

O gerador interno de convites escuta em `127.0.0.1:8091` e na `chatbot-net` como `muchat-invite`.

Secrets (`secrets.env`, `.env`, `livekit.yml`) ficam só na VPS.
