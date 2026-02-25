param(
    [string]$ApiBase = "http://127.0.0.1:8000",
    [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"

Set-Location $frontend
$env:NEXT_PUBLIC_API_BASE = $ApiBase
$env:PORT = "$Port"

npm run dev
