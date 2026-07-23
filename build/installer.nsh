; Blog Pick — 무음 자동업데이트(/S --force-run) 동안 사용자에게 보이는 안내 배너.
;
; 배경: electron-updater 의 quitAndInstall(isSilent=true) 는 앱을 종료한 뒤 NSIS 를 무음으로
; 돌린다. 그 1~2분 동안 화면에 아무것도 안 떠서, 멈춘 줄 안 사용자가 다운로드된 설치파일을
; 직접 실행 → 파일 잠금 충돌로 설치가 깨지는 사고가 있었다. 그 구간을 이 배너가 덮는다.
; (짝이 되는 보조 수단은 electron/src/updater.ts 의 showWindowsUpdateToast.)
;
; ⚠️ 이 파일은 반드시 UTF-8 with BOM 으로 저장할 것.
;    electron-builder 는 커스텀 include 를 인코딩 변환 없이 그대로 넘긴다(라이선스 파일만
;    자동 변환). NSIS 번들에 동봉된 Korean.nlf/Korean.nsh 도 같은 UTF-8+BOM 형식이다.
;
; electron-builder 가 buildResources(build/)의 installer.nsh 를 자동으로 include 하므로
; package.json 에 별도 설정은 필요 없다 (app-builder-lib/out/targets/nsis/NsisTarget.js).
;
; ${Silent} 가드: 자동 업데이트(무음)일 때만 뜬다. 첫 설치의 일반 GUI 마법사는 영향 없음.
; (LogicLib 은 common.nsh → x64.nsh 로 이미 로드돼 있고, installSection.nsh 도 ${Silent} 를 쓴다.)
;
; Banner 플러그인은 NSIS 3.0.4.1 번들의 Plugins/x86-unicode/Banner.dll 로 제공된다.
; 문법 오류나 플러그인 누락은 makensis 컴파일 단계에서 CI 빌드를 실패시키므로,
; 사용자 설치를 깨뜨릴 수 없다(electron-builder 는 -WX 로 경고도 에러 취급).

; .onInit 끝(initMultiUser 이후, 파일 추출 시작 전)에 삽입된다 → 설치 시작과 동시에 표시.
!macro customInit
  ${If} ${Silent}
    Banner::show /NOUNLOAD "업데이트 설치 중입니다. 설치 파일을 직접 실행하지 마세요."
  ${EndIf}
!macroend

; install 섹션 끝(파일 설치·바로가기 생성 후, 새 앱 force-run 직전)에 삽입된다.
; 설치가 끝나는 정확한 시점에 닫히므로 타이머로 시간을 추측할 필요가 없다.
!macro customInstall
  ${If} ${Silent}
    Banner::destroy
  ${EndIf}
!macroend
