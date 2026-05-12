// Windows Job Object 래퍼.
//
// 목적: 부모(Electron main) 핸들이 닫히는 순간 OS가 자식 트리(python/next/playwright)를
// 일괄 KILL 하도록 강제해 좀비 프로세스 0개를 보장.
//
// 전략(§C):
//   1) CreateJobObjectW(NULL, NULL)
//   2) SetInformationJobObject(... JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)
//   3) 자식 spawn 직후 AssignProcessToJobObject(hJob, OpenProcess(pid))
//   4) 종료 시 CloseHandle(hJob) → 즉시 자식 트리 KILL
//
// 어떤 단계라도 실패하면 usable=false 로 떨어뜨려, 호출 측은 기존 taskkill /T /F 정리에
// 단독 의존하게 됨(좀비 위험은 ↑ 하지만 앱 동작은 유지).

import path from "path";

const isWin = process.platform === "win32";

// 게으른(lazy) require — Win이 아니거나 koffi prebuilt 미배포 환경에서도 import 자체는 실패하지 않게.
let koffi: any = null;
function loadKoffi(): any {
  if (koffi) return koffi;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  koffi = require("koffi");
  return koffi;
}

let hJob: unknown = null;
let initialized = false;
let usable = false;

// Win32 상수
const PROCESS_SET_QUOTA = 0x0100;
const PROCESS_TERMINATE = 0x0001;
const JobObjectExtendedLimitInformation = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

interface Kernel32 {
  CreateJobObjectW: (sa: unknown, name: unknown) => unknown;
  SetInformationJobObject: (hJob: unknown, cls: number, info: Buffer, len: number) => number;
  AssignProcessToJobObject: (hJob: unknown, hProc: unknown) => number;
  OpenProcess: (access: number, inherit: number, pid: number) => unknown;
  CloseHandle: (h: unknown) => number;
  GetLastError: () => number;
}

let k32: Kernel32 | null = null;

function ensureBindings(): Kernel32 | null {
  if (!isWin) return null;
  if (k32) return k32;
  try {
    const ko = loadKoffi();
    const lib = ko.load("kernel32.dll");
    k32 = {
      CreateJobObjectW: lib.func("__stdcall", "CreateJobObjectW", "void *", ["void *", "void *"]),
      SetInformationJobObject: lib.func(
        "__stdcall",
        "SetInformationJobObject",
        "int",
        ["void *", "int", "void *", "uint32"],
      ),
      AssignProcessToJobObject: lib.func(
        "__stdcall",
        "AssignProcessToJobObject",
        "int",
        ["void *", "void *"],
      ),
      OpenProcess: lib.func("__stdcall", "OpenProcess", "void *", ["uint32", "int", "uint32"]),
      CloseHandle: lib.func("__stdcall", "CloseHandle", "int", ["void *"]),
      GetLastError: lib.func("__stdcall", "GetLastError", "uint32", []),
    };
    return k32;
  } catch (e) {
    console.warn(`[job] koffi load failed: ${(e as Error).message}. Job Object 비활성.`);
    return null;
  }
}

// x64 기준 JOBOBJECT_EXTENDED_LIMIT_INFORMATION 의 LimitFlags 오프셋:
//   PerProcessUserTimeLimit (8) + PerJobUserTimeLimit (8) = 16
// 전체 구조체 크기:
//   BASIC(64) + IO_COUNTERS(48) + ProcessMemoryLimit(8) + JobMemoryLimit(8)
//   + PeakProcessMemoryUsed(8) + PeakJobMemoryUsed(8) = 144 (x64)
const EXTLIMIT_SIZE = 144;
const LIMITFLAGS_OFFSET = 16;

function isNullHandle(h: unknown): boolean {
  if (h === null || h === undefined) return true;
  try {
    const ko = loadKoffi();
    if (typeof ko.address === "function") {
      const addr = ko.address(h);
      return addr === 0n || addr === 0;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function initJobObject(): boolean {
  if (initialized) return usable;
  initialized = true;
  if (!isWin) return false;

  const api = ensureBindings();
  if (!api) return false;

  try {
    const h = api.CreateJobObjectW(null, null);
    if (isNullHandle(h)) {
      console.warn(`[job] CreateJobObjectW 실패 lastError=${api.GetLastError()}`);
      return false;
    }
    const info = Buffer.alloc(EXTLIMIT_SIZE);
    info.writeUInt32LE(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, LIMITFLAGS_OFFSET);
    const ok = api.SetInformationJobObject(h, JobObjectExtendedLimitInformation, info, EXTLIMIT_SIZE);
    if (!ok) {
      console.warn(`[job] SetInformationJobObject 실패 lastError=${api.GetLastError()}`);
      try { api.CloseHandle(h); } catch { /* ignore */ }
      return false;
    }
    hJob = h;
    usable = true;
    console.log("[job] Job Object 초기화 완료 (KILL_ON_JOB_CLOSE)");
    return true;
  } catch (e) {
    console.warn(`[job] init 예외: ${(e as Error).message}`);
    return false;
  }
}

export function assignToJob(pid: number | undefined): boolean {
  if (!usable || !hJob || !pid) return false;
  const api = k32;
  if (!api) return false;
  try {
    const hProc = api.OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
    if (isNullHandle(hProc)) {
      console.warn(`[job] OpenProcess(${pid}) 실패 lastError=${api.GetLastError()}`);
      return false;
    }
    const ok = api.AssignProcessToJobObject(hJob, hProc);
    if (!ok) {
      console.warn(`[job] AssignProcessToJobObject(${pid}) 실패 lastError=${api.GetLastError()}`);
    } else {
      console.log(`[job] pid=${pid} 자식 트리에 결합`);
    }
    try { api.CloseHandle(hProc); } catch { /* ignore */ }
    return !!ok;
  } catch (e) {
    console.warn(`[job] assign 예외: ${(e as Error).message}`);
    return false;
  }
}

export function closeJobObject(): void {
  if (!hJob) return;
  const api = k32;
  try {
    if (api) api.CloseHandle(hJob);
  } catch {
    /* ignore */
  }
  hJob = null;
  usable = false;
}

// 진단용 (verify-orphans.ps1 에서 참조 가능)
export function jobObjectStatus(): "active" | "inactive" {
  return usable ? "active" : "inactive";
}

// 외부에서 splash 경로 등 paths 모듈 사용 시 path 미사용 경고 방지용 no-op.
// (eslint no-unused-vars 회피)
void path;
