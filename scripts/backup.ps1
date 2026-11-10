$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force backups | Out-Null
$backupName = 'stock-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
# Escritura dentro del contenedor para evitar recodificacion de PowerShell.
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump -u "$MYSQL_USER" --no-tablespaces --single-transaction --routines "$MYSQL_DATABASE" > /tmp/stock-backup.sql'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el backup' }
docker compose cp db:/tmp/stock-backup.sql "backups/$backupName"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el backup' }
Write-Output "Backup guardado en backups/$backupName"
