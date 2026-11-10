param(
  [string]$ComposeFile = "docker-compose.yml"
)

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$destination = Join-Path $backupDir "stock_$timestamp.sql"

docker compose -f (Join-Path $root $ComposeFile) exec -T db sh -c `
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' |
  Set-Content -Path $destination -Encoding UTF8

Write-Output "Backup creado: $destination"
