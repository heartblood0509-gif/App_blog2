# verify-orphans.ps1
#
# 설치본을 부팅 → 자식 트리(python/node/chrome)가 떴는지 확인 → 부모를 강제 종료
# → 자식이 모두 사라졌는지 검증. 좀비가 남으면 비-zero exit.
#
# 실행 예:
#   powershell -ExecutionPolicy Bypass -File scripts/verify-orphans.ps1
#
# 가정:
#   release\win-unpacked\Blog Pick.exe 가 존재 (npm run dist 이후).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $root "release\win-unpacked\Blog Pick.exe"

if (-not (Test-Path $exe)) {
  Write-Error "FAIL: 설치본을 찾을 수 없습니다: $exe (npm run dist 먼저 실행)"
  exit 2
}

Write-Host "[verify-orphans] 부팅: $exe"
$proc = Start-Process -PassThru -FilePath $exe
Start-Sleep -Seconds 12   # 백엔드/Playwright 기동 대기

# 우리 설치본에서 spawn 된 자식만 식별 (Path 기준)
function Get-OurChildren {
  Get-Process -Name python,node,chrome,BlogPublisher -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Path -and (
        $_.Path -like "*Blog Pick*" -or
        $_.Path -like "*ms-playwright*" -or
        $_.Path -like "*resources\backend*"
      )
    }
}

$before = Get-OurChildren
Write-Host "[verify-orphans] before 자식: $($before.Count)"
if ($before.Count -lt 2) {
  Write-Warning "자식 프로세스가 충분히 떠있지 않습니다($($before.Count)). 백엔드/Next 부팅 실패 가능."
}

Write-Host "[verify-orphans] 부모 강제 종료 (pid=$($proc.Id))"
Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 4

$after = Get-OurChildren
if ($after.Count -gt 0) {
  Write-Host "[verify-orphans] FAIL: 좀비 $($after.Count)개"
  $after | Format-Table Id, ProcessName, Path -AutoSize
  exit 1
}

Write-Host "[verify-orphans] PASS: 좀비 0개"
exit 0
