$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
  throw "Backend virtualenv python not found: $python"
}

Push-Location $backend
& $python ".\scripts\run_benchmark_suite.py"
Pop-Location

Write-Host "Benchmark artifacts:"
Get-ChildItem (Join-Path $backend "trust\artifacts\benchmark-*.json") |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 5 Name, LastWriteTime, Length |
  Format-Table -AutoSize
