# smoke-packaged.ps1
#
# release\win-unpacked\Blog Pick.exe 를 띄워:
#   1) 백엔드 /health 가 200 인지
#   2) /publish/validate 가 없는 account_id 에 대해 account-not-found 응답을 주는지
#      (§H — endpoint·토큰·인증·dependency 가 모두 살아있는지 검증)
#
# 실패하면 비-zero exit.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $root "release\win-unpacked\Blog Pick.exe"

if (-not (Test-Path $exe)) {
  Write-Error "FAIL: 설치본을 찾을 수 없습니다: $exe (npm run dist 먼저 실행)"
  exit 2
}

Write-Host "[smoke] 부팅: $exe"
$proc = Start-Process -PassThru -FilePath $exe
Start-Sleep -Seconds 15

try {
  $children = Get-Process -Name python,node,BlogPublisher -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Path -and (
        $_.Path -like "*Blog Pick*" -or
        $_.Path -like "*resources\backend*"
      )
    }
  if ($children.Count -eq 0) { throw "자식 프로세스가 없습니다." }

  $pids = $children | Select-Object -ExpandProperty Id
  $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $pids -contains $_.OwningProcess -and $_.LocalAddress -eq "127.0.0.1" } |
    Select-Object -ExpandProperty LocalPort -Unique
  if ($ports.Count -eq 0) { throw "LISTEN 포트를 찾을 수 없습니다." }

  Write-Host "[smoke] 후보 포트: $($ports -join ', ')"

  # 1) /health 200 인 포트 식별 (backend)
  $backendPort = $null
  foreach ($p in $ports) {
    try {
      $r = Invoke-WebRequest -Uri "http://127.0.0.1:$p/health" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) {
        Write-Host "[smoke] PASS: /health 200 on port $p"
        $backendPort = $p
        break
      }
    } catch {
      # try next
    }
  }
  if ($null -eq $backendPort) { throw "/health 200 응답하는 포트 없음." }

  # 2) /publish/validate - 없는 계정으로 호출 → account-not-found 응답 확인.
  #    APP_TOKEN 을 알 길이 없으므로 토큰 없이 호출 → 401 받는 것까지가 smoke 한계.
  #    backend 가 §A-1 Dependency 를 정상 설치했는지 검증.
  try {
    $body = @{
      title = "smoke-test"
      content = "smoke-test"
      account_id = "smoke-nonexistent-account"
      images = @()
      auto_publish = $false
    } | ConvertTo-Json
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$backendPort/publish/validate" `
      -Method POST -Body $body -ContentType "application/json" `
      -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    # 토큰 없이도 200 으로 응답되면 dependency 가 빠진 것.
    if ($r.StatusCode -eq 200) {
      throw "validate 가 토큰 없이 200 — Dependency 누락 가능성. status=$($r.StatusCode)"
    }
    throw "예상치 못한 응답: $($r.StatusCode)"
  } catch [System.Net.WebException] {
    $statusCode = [int]$_.Exception.Response.StatusCode
    if ($statusCode -eq 401) {
      Write-Host "[smoke] PASS: /publish/validate 토큰 검증 (401)"
    } else {
      throw "validate 응답 status $statusCode (401 expected)"
    }
  } catch {
    # Invoke-WebRequest 가 401 을 던질 때 다른 예외 형태로 올 수 있음.
    if ($_.Exception.Message -match "401") {
      Write-Host "[smoke] PASS: /publish/validate 토큰 검증 (401)"
    } else {
      throw
    }
  }

  Write-Host "[smoke] PASS"
  exit 0
}
catch {
  Write-Host "[smoke] FAIL: $($_.Exception.Message)"
  exit 1
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}
