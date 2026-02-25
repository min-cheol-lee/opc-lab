$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendCmd = "Set-Location '$root'; .\dev-backend.ps1"
$frontendCmd = "Set-Location '$root'; .\dev-frontend.ps1"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null

Write-Host "Started backend and frontend in separate terminals."
