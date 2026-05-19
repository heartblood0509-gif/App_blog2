# verify-update.ps1
#
# 업데이트 워크플로우 수동 검증을 도와주는 스크립트.
# (완전 자동 — 더미 feed.xml 로컬 서버 — 구현은 후속 단계.
#  이번 버전은 사용자에게 단계별 체크리스트를 출력해서, GitHub Releases 에 v0.1.1 더미를
#  올린 뒤 흐름을 눈으로 확인하도록 안내한다.)
#
# 실행 예:
#   powershell -ExecutionPolicy Bypass -File scripts/verify-update.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$pkg  = Join-Path $root "package.json"

if (-not (Test-Path $pkg)) {
  Write-Error "FAIL: package.json 을 찾을 수 없습니다: $pkg"
  exit 2
}

$ver = (Get-Content $pkg -Raw | ConvertFrom-Json).version
Write-Host "현재 package.json 버전: $ver"
Write-Host ""
Write-Host "다음 순서로 업데이트 흐름을 검증하세요:"
Write-Host ""
Write-Host "  1) 현재 버전($ver) 인스톨러로 설치."
Write-Host "     릴리스 폴더: release\App Blog Publisher-Setup-$ver-x64.exe"
Write-Host ""
Write-Host "  2) package.json 의 version 을 patch (예: $ver → $(([Version]$ver).Major).$(([Version]$ver).Minor).$(([Version]$ver).Build + 1))"
Write-Host "     로 올린 뒤 tag 를 push 하여 GitHub Actions 릴리스를 실행."
Write-Host "     예: npm version patch; git push --follow-tags"
Write-Host ""
Write-Host "  3) 설치된 앱 실행. 4초 뒤 자동 check 가 실행됨."
Write-Host "     ✓ 화면에 '새 버전이 있습니다' 모달이 떠야 함."
Write-Host "     ✓ '다운로드' 누르면 진행률 바가 차오름."
Write-Host "     ✓ 100% 후 '지금 설치' 누르면 메인 창이 사라지고 splash 가 잠깐 보임."
Write-Host "     ✓ NSIS 인스톨러가 지나간 후 새 버전이 자동 재시작."
Write-Host ""
Write-Host "  4) '나중에' 버튼을 눌렀을 때 종료해도 새 버전이 깔리지 않아야 함"
Write-Host "     (autoInstallOnAppQuit=false 검증)."
Write-Host ""
Write-Host "[verify-update] 안내 출력 완료. 실제 검증은 사람이 진행."
exit 0
