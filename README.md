# Muchat — chat privado da MuhBianco em chat.muhbianco.com.br
#
# Caixa preta: Stoat (ex-Revolt) + LiveKit + SSO Discord neste repo.
# A api-agents não participa do login nem do ForwardAuth.

Este repositório é o overlay da hel1. O compose upstream vem de
https://github.com/stoatchat/self-hosted na hora do bootstrap.

## Isolamento

- Rede overlay `stoat-net` (não é `chatbot-net`).
- Traefik ForwardAuth → `http://sso:8090/forward` (container `muchat-sso`, 128M).
- Cookie `muchat_gate` só no host `chat.muhbianco.com.br` (sem `Domain=.muhbianco.com.br`).
- Entra quem é membro do servidor Discord. Não exige cargo de admin do site.

## Discord Developer Portal

No mesmo app OAuth do site (ou num app só do chat), acrescente o redirect:

`https://chat.muhbianco.com.br/oauth/callback`

Copie `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` e `DISCORD_SERVER_ID` para
`/usr/src/stoat/.env` na VPS. Não commitar.

## VPS

```bash
git clone git@github.com:muhbianco/muchat.git /usr/src/muchat
bash /usr/src/muchat/scripts/bootstrap.sh
# preencha DISCORD_* em /usr/src/stoat/.env
docker network create --driver overlay --attachable stoat-net || true
cd /usr/src/stoat
docker compose -p stoat build sso
docker compose -p stoat up -d
```

Traefik precisa estar na rede `stoat-net`. O `dynamic_conf.yaml` usa o
fragmento em `traefik/chat.yaml` (router `Host(chat.muhbianco.com.br)`).

Portas de mídia no host: TCP 7881, UDP 3478, UDP 50000-50100.

Secrets (`secrets.env`, `.env`, `livekit.yml`) ficam só na VPS.
