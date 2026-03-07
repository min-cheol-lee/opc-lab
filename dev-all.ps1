$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendCmd = "Set-Location '$root'; `$host.UI.RawUI.WindowTitle = 'litopc backend'; .\dev-backend.ps1"
$frontendCmd = "Set-Location '$root'; `$host.UI.RawUI.WindowTitle = 'litopc frontend'; .\dev-frontend.ps1"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null

Write-Host "Started litopc backend and frontend in separate terminals."
