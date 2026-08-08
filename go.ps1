$ErrorActionPreference = 'Continue'
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
Remove-Item "debug.out.txt","vite.log" -Force -ErrorAction SilentlyContinue

$job = Start-Job -ScriptBlock {
  Set-Location "C:\Users\jonas\Desktop\Main\Coding\Projects_2/OrkenSatis/02"
  & npm run dev 2>&1
} -Name vite
Write-Host "waiting for dev server (up to 70s)..."
$ready = $false
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt 70) {
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:5173/ -TimeoutSec 1; if ($r.StatusCode -eq 200) { $ready = $true; break } }
  catch { }
  Start-Sleep -Milliseconds 500
}
Write-Host "dev server ready: $ready (after $($sw.Elapsed.TotalSeconds)s)"
if (-not $ready) {
  Write-Host "--- job output (tail) ---"
  Receive-Job $job | Select-Object -Last 25
  Stop-Job $job; Remove-Job $job
  exit 1
}

try {
  $pi = Start-Process node -ArgumentList "debug.mjs" -WorkingDirectory "C:\Users/jonas/Desktop/Main/Coding/Projects_2/OrkenSatis/02" -NoNewWindow -PassThru
  $pi.WaitForExit(30000)
  if (-not $pi.HasExited) { Write-Host "harness did not exit; killing"; Stop-Process -Id $pi.Id -Force -ErrorAction SilentlyContinue }
  Write-Host "=== debug.out.txt ==="
  if (Test-Path "debug.out.txt") { Get-Content "debug.out.txt" | Write-Host } else { Write-Host "(no debug.out.txt produced)" }
} finally {
  Get-Process -Name chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  if (Test-Path "C:\temp\cdp-profile") { Remove-Item "C:\temp\cdp-profile" -Recurse -Force -ErrorAction SilentlyContinue }
}
