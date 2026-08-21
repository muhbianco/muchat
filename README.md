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

- PWA, título, splash, sons, dock de voz, picker de tela e banner de update
  vivem no fork `muhbianco/for-web`, não neste overlay. Não há mais `boot.js`
  nem patch de `index.html`: a imagem `muchat-web:latest` já sai pronta.
- `brand/public/` serve só assets estáticos (`/download`, ícones, sons-fonte).
- Windows: `https://chat.muhbianco.com.br/download` (`Muchat-Setup-<versão>.exe`)
- Android: o mesmo `/download` (`Muchat-<versão>.apk`)

## Convites de conta

Pela API autenticada (admin, escopo `users:write`, JWT ou chave `mbk_`):

`POST https://api.muhbianco.com.br/api/latest/muchat/invites`

Body: `{"count":1}` — devolve o link `/login/create/<codigo>`. Sem `created_by` o convite é de ops (sem cota).

Bot no chat (conta owner → My Bots): cada usuário Stoat pode gerar **2** convites, listar e apagar os que ainda não foram usados. O processo `invite-bot` autentica na `api.muhbianco` com uma chave `mbk_` da conta admin (o mesmo tipo da API de feriados — `X-API-Key`). Body do bot:

```json
{"created_by":"<id do usuario stoat>","count":1,"email":"opcional@amigo.com"}
```

`GET /api/latest/muchat/invites?created_by=` lista. `DELETE /api/latest/muchat/invites/{code}?created_by=` apaga só unused.

HTTP custom no agente: Bearer ou `X-API-Key` = chave `mbk_` da conta admin (não use access token de 15 min).

Na VPS ainda vale:

```bash
bash /usr/src/muchat/scripts/create-invite.sh
```

### Bot de convites (uma vez)

1. Logado como `contato@muhbianco.com.br`: Configurações → My Bots → Create Bot (ex.: `Convites`).
2. Copy Token. Colar em `/usr/src/stoat/.env` como `STOAT_BOT_TOKEN`.
3. Na conta admin da api.muhbianco, emitir mais uma chave `mbk_` (serviço feriados, como as outras). Colar como `MUHBIANCO_API_KEY`.
4. `MUCHAT_INVITE_EMAIL_WEBHOOK_URL` e `MUCHAT_INVITE_EMAIL_WEBHOOK_SECRET` (mesmo Header Auth `HOOK` do n8n transacional; path `muchat-convite`).
5. `bash /usr/src/muchat/scripts/bootstrap.sh` (copia `invite-bot/` pro overlay em `/usr/src/stoat`). Depois, no stoat: `docker compose -p stoat build invite invite-bot && docker compose -p stoat up -d --remove-orphans`

O bot entra sozinho em todos os servidores (poll no Mongo a cada 30s). Conversa é por DM.

## Dev local (fork + .exe sem deploy)

O shell aponta pro dev server do fork via `MUCHAT_ORIGIN`. Com override ativo ele
abre o DevTools e não limpa cache/storage, então a sessão sobrevive aos restarts.

No fork (`for-web`), uma vez:

```bash
git submodule update --init packages/stoat.js packages/solid-livekit-components
pnpm install
pnpm --filter client exec lingui compile --typescript
pnpm --filter client exec node scripts/copyAssets.mjs
pnpm --filter client exec panda codegen
```

Depois, a cada sessão:

```bash
# terminal 1 — dev server do fork contra a API de produção
VITE_HOST=chat.muhbianco.com.br pnpm --filter client exec vite dev

# terminal 2 — o .exe apontado no dev server
cd muchat/desktop && npm run dev
```

`VITE_HOST` define o `DEFAULT_HOST` do client, então o login e o LiveKit são os
de produção — conta real, call real, sem subir backend local.

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
