# electron/

Electron main 과 자식 매니저들. 본 폴더의 핵심은 다음 모듈들 위에서 동작:

- `src/main.ts` 진입점. 토큰 생성, broker/Python/Next 부팅, BrowserWindow, busy/updater IPC.
- `src/python-manager.ts` Python(FastAPI) 자식.
- `src/next-server.ts` Next standalone 자식.
- `src/credential-broker.ts` Electron 호스팅 HTTP 서버. backend 가 safeStorage encrypt/decrypt 호출.
- `src/settings.ts` `userData/settings.json` 의 Gemini key 잠금/복원.
- `src/log-redactor.ts` electron-log 마스킹.
- `src/job-object.ts` Windows Job Object 좀비 방지.
- `src/updater.ts` electron-updater + busy guard.

## dev / packaged 실행 매트릭스

| 컴포넌트 | dev 모드 (`npm run dev`) | packaged 모드 (NSIS 설치본) |
|---|---|---|
| Electron main | `electron electron/dist/main.js` | `App Blog Publisher.exe` (asar 안의 `dist/main.js`) |
| Python backend | `python main.py` shell spawn (backend cwd) | `BlogPublisher.exe` (PyInstaller `resources/backend/`) |
| Next 서버 | `npx next dev` shell spawn | `process.execPath` + `ELECTRON_RUN_AS_NODE=1` + `resources/frontend/server.js` (Next standalone) |
| 자식 spawn 방식 | `shell: true` (Windows cmd 경유) | `shell: false` (직접 exec) |
| APP_TOKEN env | Electron 이 생성 후 주입 (32B random hex) | 동일 |
| APP_SESSION_TOKEN env | Electron 이 NextServerManager 에만 주입 | 동일 |
| APP_CREDENTIAL_BROKER_URL env | Electron 이 broker 띄운 뒤 PythonManager 에 주입 | 동일 |
| ALLOW_INSECURE_DEV_AUTH | dev PC 사용자가 `start.sh` 등에서 직접 set 가능 | **never set by Electron** (fail-closed) |
| 자체 노드 실행 | dev 머신의 `node.exe` 또는 `electron.exe` | packaged 안에 `node.exe` 없음 — `process.execPath` 사용 |

## env 책임 매트릭스

| env | 누가 set | 누가 read |
|---|---|---|
| `APP_TOKEN` | Electron main | Python backend (auth.py), Next 서버 (backendFetch) |
| `APP_SESSION_TOKEN` | Electron main | Next 서버 (proxy.ts) — Set-Cookie 발급 + /api/* 검증 |
| `APP_CREDENTIAL_BROKER_URL` | Electron main | Python backend (credentials.py) |
| `FRONTEND_ORIGIN` | Electron main | Python backend (CORS allow_origins) |
| `APP_DATA_DIR` | Electron main = `app.getPath("userData")` | Python backend (paths.py) |
| `CHROME_PROFILES_DIR` | Electron main = `${userData}/chrome-profiles` | Python backend |
| `PLAYWRIGHT_BROWSERS_PATH` | Electron main | Python backend (Playwright lib) |
| `GEMINI_API_KEY` | Electron main (settings.json decrypt) | Next 서버 (gemini.ts) |
| `ALLOW_INSECURE_DEV_AUTH` | **사용자 (dev only)** | Python backend (auth.py, main.py fail-closed) |
| `ALLOW_INSECURE_DEV_PW` | **사용자 (dev only)** | Python backend (credentials.py fallback) |

## 안전성 정책 요약

- 모든 보안 토큰은 부팅마다 새로 생성 (crypto.randomBytes(32)).
- packaged 빌드의 main.ts 컴파일 결과(`dist/main.js`)에 `ALLOW_INSECURE_DEV_*` 문자열이 들어있지 않아야 함 — `npm run verify:no-dev-flags` 가 검증.
- Job Object KILL_ON_JOB_CLOSE 로 main 종료 시 자식 트리 일괄 KILL.
- safeStorage(DPAPI) 로 네이버 PW 와 Gemini key 잠금.
- electron-log + Python logging 모두 redact filter 적용.
