#!/bin/sh
# Backup de la base para el servidor Linux. El equivalente Windows es backup.ps1.
# Uso: ./scripts/backup.sh   (o por cron)
set -e

cd "$(dirname "$0")/.."
mkdir -p backups

archivo="backups/stock_$(date +%Y-%m-%d_%H-%M).sql.gz"

docker compose exec -T db sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' \
  | gzip > "$archivo"

# Si el dump fallo el archivo queda casi vacio. En ese caso no se borra nada:
# es preferible quedarse con los backups viejos que rotarlos por uno roto.
if [ "$(wc -c < "$archivo")" -lt 1000 ]; then
  rm -f "$archivo"
  echo "ERROR: el backup salio vacio, no se toco nada" >&2
  exit 1
fi

# ponytail: retencion local de 14 dias. Para copia fuera del servidor, agregar
# Agregá aquí el comando que uses para guardar copias fuera del equipo.
find backups -name 'stock_*.sql.gz' -mtime +14 -delete

echo "Backup creado: $archivo"
