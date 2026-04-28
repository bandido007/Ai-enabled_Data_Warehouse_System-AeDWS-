# Run this script as Administrator to set the postgres password and create the app DB/user.
# Usage: Right-click -> Run with PowerShell (as Admin), or:
#   Start-Process powershell -Verb RunAs -ArgumentList "-File C:\...\setup_postgres.ps1"

param(
    [string]$NewPassword = "Admin@Wdms2026!"
)

$pgBin  = "C:\Program Files\PostgreSQL\16\bin"
$pgData = "C:\Program Files\PostgreSQL\16\data"
$hba    = "$pgData\pg_hba.conf"
$hbaBak = "$hba.bak"

Write-Host "=== Step 1: Backup pg_hba.conf ===" -ForegroundColor Cyan
Copy-Item $hba $hbaBak -Force
Write-Host "Backed up to $hbaBak"

Write-Host "`n=== Step 2: Set trust auth temporarily ===" -ForegroundColor Cyan
$content = Get-Content $hba
# Replace scram-sha-256 or md5 with trust for all host lines
$modified = $content | ForEach-Object {
    if ($_ -match '^(host|local)\s') {
        $_ -replace 'scram-sha-256', 'trust' -replace '\bmd5\b', 'trust'
    } else { $_ }
}
Set-Content $hba $modified
Write-Host "pg_hba.conf updated to trust"

Write-Host "`n=== Step 3: Reload PostgreSQL ===" -ForegroundColor Cyan
& "$pgBin\pg_ctl.exe" reload -D $pgData
Start-Sleep -Seconds 2

Write-Host "`n=== Step 4: Set postgres superuser password ===" -ForegroundColor Cyan
& "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER USER postgres PASSWORD '$NewPassword';"

Write-Host "`n=== Step 5: Create app database and user ===" -ForegroundColor Cyan
& "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wdms_user') THEN CREATE USER wdms_user WITH PASSWORD 'wdms_pass'; END IF; END `$`$;"
& "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "SELECT 1 FROM pg_database WHERE datname='warehouse_dms'" | Out-String | ForEach-Object {
    if ($_ -notmatch '1 row') {
        & "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE warehouse_dms OWNER wdms_user;"
        Write-Host "Database warehouse_dms created."
    } else {
        Write-Host "Database warehouse_dms already exists."
    }
}
& "$pgBin\psql.exe" -U postgres -h 127.0.0.1 -c "GRANT ALL PRIVILEGES ON DATABASE warehouse_dms TO wdms_user;"

Write-Host "`n=== Step 6: Restore scram-sha-256 auth ===" -ForegroundColor Cyan
$restored = Get-Content $hba | ForEach-Object {
    if ($_ -match '^(host|local)\s') {
        $_ -replace '\btrust\b', 'scram-sha-256'
    } else { $_ }
}
Set-Content $hba $restored
& "$pgBin\pg_ctl.exe" reload -D $pgData
Write-Host "pg_hba.conf restored to scram-sha-256"

Write-Host "`n=== DONE ===" -ForegroundColor Green
Write-Host "postgres password : $NewPassword"
Write-Host "App DB user       : wdms_user / wdms_pass"
Write-Host "App database      : warehouse_dms"
Write-Host ""
Write-Host "Now update your .env:"
Write-Host "  DATABASE_URL=postgresql://wdms_user:wdms_pass@localhost:5432/warehouse_dms"
Read-Host "Press Enter to close"
