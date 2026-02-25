param(
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Error "Backend venv not found at: $python"
}

Set-Location $backend
& $python -m uvicorn app.main:app --host $HostAddress --port $Port --reload
