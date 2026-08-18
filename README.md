# Muchat — chat privado da MuhBianco em chat.muhbianco.com.br
#
# Stoat (ex-Revolt) + LiveKit. Login: Discord OAuth da API MuhBianco
# (basta estar no servidor; não exige o cargo de admin do site).

Este repositório é o overlay da hel1. O compose upstream vem de
https://github.com/stoatchat/self-hosted na hora do bootstrap.

## VPS

```bash
git clone git@github.com:muhbianco/muchat.git /usr/src/muchat
bash /usr/src/muchat/scripts/bootstrap.sh
docker network create --driver overlay --attachable stoat-net || true
cd /usr/src/stoat
docker compose -p stoat build sso
docker compose -p stoat up -d
```

Traefik precisa estar na rede `stoat-net` e o `dynamic_conf.yaml` precisa do
router `Host(chat.muhbianco.com.br)` com ForwardAuth para
`http://api-agents_api_agents:8000/api/latest/auth/chat/forward`.

Portas de mídia no host: TCP 7881, UDP 3478, UDP 50000-50100.

Secrets (`secrets.env`, `.env`, `livekit.yml`) ficam só na VPS.
