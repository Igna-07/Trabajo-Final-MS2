#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -u "$MYSQL_USER" --no-tablespaces --single-transaction --routines "$MYSQL_DATABASE"' > "backups/stock-$(date +%Y%m%d-%H%M%S).sql"
