#!/usr/bin/env bash
# Cria um convite de *conta* (invite-only da instância). Não é convite de servidor.
set -euo pipefail

CODE="${1:-}"
if [[ -z "$CODE" ]]; then
  CODE="$(openssl rand -hex 8)"
fi
if [[ ! "$CODE" =~ ^[A-Za-z0-9_-]{4,64}$ ]]; then
  echo "Código inválido. Use 4–64 caracteres [A-Za-z0-9_-]." >&2
  exit 1
fi

docker exec stoat-database-1 mongosh --quiet revolt --eval "
db.account_invites.updateOne(
  {_id: '${CODE}'},
  {\$setOnInsert: {_id: '${CODE}', used: false}},
  {upsert: true}
);
const doc = db.account_invites.findOne({_id: '${CODE}'});
if (doc.used === true) {
  print('USED');
} else {
  print('OK');
}
"
echo "https://chat.muhbianco.com.br/login/create/${CODE}"
