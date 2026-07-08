"""미리보기 API — 이미지 미리보기 + AI 클립 미리보기"""

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Path, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, Literal
from sqlalchemy.orm import Session
from api.models import (
    PreviewResponse,
    ClipPreviewResponse,
    ScriptLine,
    SplitLineRequest,
    SplitLineResponse,
    EditLineRequest,
    MergeLineRequest,
    DeleteLineRequest,
    LineVisualRequest,
)
from api.deps import get_approved_user, get_user_job
from db.database import get_db
from db.models import Job, JobTask, User
from jobs_queue.task_queue import ACTIVE_STATUSES, enqueue_task, get_active_task, task_payload
from core.r2_storage import require_r2_for_generation, is_r2_enabled, r2_file_exists
from core.ffmpeg import FFMPEG_Q, FFPROBE
from core.image_pipeline import normalize_transform, KEN_BURNS_MOTIONS
from core.text_validation import contains_emoji
from core.colors import normalize_hex, DEFAULT_TITLE_COLOR1, DEFAULT_TITLE_COLOR2
from config import settings
from PIL import Image, ImageOps
from core.user_assets_visual import (
    bump_line_asset_version,
    clear_line_asset_progress,
    clear_line_visual_fields,
    ensure_line_ids,
    invalidate_visual_plan,
    legacy_line_asset_rel,
    line_asset_rel,
    line_asset_rel_candidates,
    mark_line_asset_ready,
    new_line_id,
    parse_visual_plan,
    r2_job_asset_key,
    set_line_asset_progress,
    style_suffix,
    visual_plan_script_hash,
)
import asyncio
import json
import os
import io
import logging
import shutil
import shlex
import subprocess
import uuid
import sys

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs", tags=["preview"])

# 카드 B 선트림 업로드: 선택 구간 앞뒤에 붙이는 여유분(초). 업로드 후 이 범위 안에서 시작점 미세조정.
CLIP_PAD_SEC = 2.0
# 영상 길이 대 나레이션 길이 허용 오차(초). video_assembler 의 판정 오차와 동일하게 맞춘다.
CLIP_FIT_EPS = 0.05
# 선트림 업로드가 원본으로 허용하는 확장자(소문자 비교). ffprobe/ffmpeg 로 실제 검증은 별도.
CLIP_IMPORT_EXTS = {".mp4", ".mov", ".webm", ".avi", ".m4v"}


def _require_generation_storage():
    try:
        require_r2_for_generation()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ── 카드 B: 진행 중인 AI 이미지 생성 추적 (분할 시 경쟁 가드용) ──
_AI_IN_FLIGHT: dict[str, set[int]] = {}
_AI_IN_FLIGHT_LOCK = asyncio.Lock()


async def _mark_ai_started(job_id: str, line_index: int) -> None:
    async with _AI_IN_FLIGHT_LOCK:
        _AI_IN_FLIGHT.setdefault(job_id, set()).add(line_index)


async def _mark_ai_finished(job_id: str, line_index: int) -> None:
    async with _AI_IN_FLIGHT_LOCK:
        s = _AI_IN_FLIGHT.get(job_id)
        if s:
            s.discard(line_index)
            if not s:
                _AI_IN_FLIGHT.pop(job_id, None)


def _ai_in_flight_count(job_id: str) -> int:
    return len(_AI_IN_FLIGHT.get(job_id, set()))


def _ffprobe_duration(path: str) -> float:
    """영상 길이(초). 실패 시 0.0.

    사용자 임의 경로(선트림)가 들어오므로 shell 없이 리스트 인자로 호출한다 — 파일명에
    `$(...)`·백틱이 있어도 셸이 없어 실행되지 않는다(경로 인젝션 차단).
    """
    try:
        args = [
            FFPROBE, "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", path,
        ]
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception:
        pass
    return 0.0


def _probe_video_info(path: str) -> tuple[str, int, int]:
    """(codec_name, width, height). 실패 시 ("", 0, 0). 진단·다운스케일 판단용.

    _ffprobe_duration 과 같은 이유로 shell 없이 리스트 인자 호출(경로 인젝션 차단).
    """
    try:
        args = [
            FFPROBE, "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", path,
        ]
        r = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0 and r.stdout.strip():
            parts = r.stdout.strip().split(",")
            codec = parts[0] if parts else ""
            w = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
            h = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
            return codec, w, h
    except Exception:
        pass
    return "", 0, 0


# 하드웨어 디코딩 스위치 — HEVC(폰 영상) 소프트웨어 디코딩이 느려서, 지원 플랫폼은 GPU 로 푼다.
_HWACCEL = "-hwaccel videotoolbox " if sys.platform == "darwin" else ""
# 잘라 저장하는 조각의 긴 변 상한(px). 최종 쇼츠는 1080×1920 이라 4K 원본을 그대로 둘 이유가 없다.
# 다운스케일하면 인코딩이 크게 빨라지고 파일도 작아진다(렌더가 어차피 1080×1920 로 다시 맞춤).
CLIP_CUT_MAX_LONG_SIDE = 2560

# ── 자막 스타일 클램프 범위 (confirm/draft-meta 양쪽에서 동일 적용) ──
SUBTITLE_SIZE_MIN = 36
SUBTITLE_SIZE_MAX = 80
SUBTITLE_DX_ABS = 350   # 가로 중앙 오프셋 절대값(px, 1080폭 기준)
SUBTITLE_Y_MIN = 60
SUBTITLE_Y_MAX = 1750   # 자막 상단 y(px, 1920높이 기준)
DEFAULT_SUBTITLE_COLOR = "#FFFFFF"

# ── 모션(줌) 속도 클램프 범위 (작업 전역, 초당 확대 비율) ──
# UI 슬라이더 범위(기준 0.0125/s 대비 10~500% = 0.00125~0.0625/s)를 여유 있게 포함.
MOTION_SPEED_MIN = 0.001
MOTION_SPEED_MAX = 0.08

# ── 제목 위치 클램프 범위 (confirm/draft-meta 양쪽에서 동일 적용, 프론트 ShortsPreviewFrame 과 동일) ──
# dx=가로 중앙 오프셋, dy=기본 위치(폰트 크기로 계산되는 상단) 기준 세로 델타. 0=기존 고정 위치.
TITLE_DX_ABS = 350
TITLE_DY_MIN = -110
TITLE_DY_MAX = 1480
# 제목 줄별 글자 크기 / 줄 간격 클램프 (video_assembler·프론트 fonts.ts 와 동일).
TITLE_SIZE_MIN = 70
TITLE_SIZE_MAX = 170
TITLE_LINE_GAP_MIN = 40
TITLE_LINE_GAP_MAX = 260


def apply_subtitle_style(
    job,
    *,
    font=None,
    weight=None,
    size=None,
    color=None,
    dx=None,
    y=None,
) -> None:
    """자막 스타일(작업 전역)을 Job 에 클램프해서 반영. None 인 항목은 미변경.

    폰트/굵기 id 유효성은 렌더 시 resolve_title_font_path 가 폴백 처리하므로 여기선 문자열만 받는다.
    색은 drawtext 필터에 박히므로 normalize_hex 로 정규화(1차 방어). 숫자 필드는 raw JSON 이라
    NaN/문자열 방어 후 범위 clamp. confirm(dict)·draft-meta(pydantic) 양쪽이 이 헬퍼를 공유한다.
    """
    if font is not None:
        job.subtitle_font = str(font)
    if weight is not None:
        job.subtitle_font_weight = str(weight)
    if size is not None:
        try:
            job.subtitle_font_size = max(SUBTITLE_SIZE_MIN, min(SUBTITLE_SIZE_MAX, int(float(size))))
        except (TypeError, ValueError):
            pass
    if color is not None:
        job.subtitle_color = normalize_hex(color, DEFAULT_SUBTITLE_COLOR)
    if dx is not None:
        try:
            job.subtitle_dx = max(-SUBTITLE_DX_ABS, min(SUBTITLE_DX_ABS, int(float(dx))))
        except (TypeError, ValueError):
            pass
    if y is not None:
        try:
            job.subtitle_y = max(SUBTITLE_Y_MIN, min(SUBTITLE_Y_MAX, int(float(y))))
        except (TypeError, ValueError):
            pass


def apply_motion_speed(job, value) -> None:
    """줌(모션) 속도(작업 전역, 초당 확대 비율)를 Job 에 클램프해서 반영. None 이면 미변경.

    raw JSON(confirm) / pydantic(draft-meta) 양쪽에서 공유. NaN/문자열은 무시(기존값 유지).
    """
    if value is None:
        return
    try:
        v = float(value)
    except (TypeError, ValueError):
        return
    if v != v:  # NaN
        return
    job.motion_speed = max(MOTION_SPEED_MIN, min(MOTION_SPEED_MAX, v))


def apply_title_pos(job, dx=None, dy=None) -> None:
    """제목 위치 오프셋(드래그)을 Job 에 클램프해서 반영. None 인 항목은 미변경.

    apply_subtitle_style 의 dx/y 와 같은 방어 패턴(raw JSON 숫자 방어 + clamp).
    dy 는 절대 y 가 아니라 기본 위치 기준 델타 — 기본 세로 위치는 렌더 시 폰트 크기로
    계산되므로(video_assembler) 여기선 델타만 저장한다. confirm(dict)·draft-meta(pydantic) 공유.
    """
    if dx is not None:
        try:
            job.title_dx = max(-TITLE_DX_ABS, min(TITLE_DX_ABS, int(float(dx))))
        except (TypeError, ValueError):
            pass
    if dy is not None:
        try:
            job.title_dy = max(TITLE_DY_MIN, min(TITLE_DY_MAX, int(float(dy))))
        except (TypeError, ValueError):
            pass


def apply_title_sizes(job, *, line1=None, line2=None, gap=None) -> None:
    """제목 줄별 글자 크기·줄 간격을 Job 에 클램프해서 반영. None 인 항목은 미변경.

    line1/line2=None 이면 렌더 시 title_font_size 로 폴백(두 줄 단일 크기 = 레거시 불변).
    gap=None 이면 기존 round(130*size/120) 공식. confirm(dict)·draft-meta(pydantic) 공유.
    """
    if line1 is not None:
        try:
            job.title_line1_size = max(TITLE_SIZE_MIN, min(TITLE_SIZE_MAX, int(float(line1))))
        except (TypeError, ValueError):
            pass
    if line2 is not None:
        try:
            job.title_line2_size = max(TITLE_SIZE_MIN, min(TITLE_SIZE_MAX, int(float(line2))))
        except (TypeError, ValueError):
            pass
    if gap is not None:
        try:
            job.title_line_gap = max(TITLE_LINE_GAP_MIN, min(TITLE_LINE_GAP_MAX, int(float(gap))))
        except (TypeError, ValueError):
            pass


def _replace_with_retry(src_abs: str, dst_abs: str, *, attempts: int = 5, delay: float = 0.15) -> None:
    """os.replace + 윈도우 재시도. 렌더/FileResponse 가 dst 를 잠깐 열고 있는 순간 교체하면
    Windows 에서 PermissionError 가 날 수 있어 짧게 대기 후 재시도한다(다른 OS 는 대개 첫 시도 성공)."""
    import time as _time
    for i in range(attempts):
        try:
            os.replace(src_abs, dst_abs)
            return
        except PermissionError:
            if i == attempts - 1:
                raise
            _time.sleep(delay)


def _cut_clip_segment(
    src_abs: str,
    dst_abs: str,
    in_sec: float,
    needed_sec: float,
    pad_sec: float = CLIP_PAD_SEC,
) -> tuple[float, float]:
    """원본에서 [in-pad, in+needed+pad] 구간을 재인코딩으로 잘라 dst_abs 에 저장.

    - `-ss` 를 `-i` 앞에 두고 재인코딩 → 프레임 정확 + HEVC(아이폰) → H264 정규화(프리뷰 재생 보장).
    - 앞뒤 여유분(pad)을 붙여, 업로드 후 그 범위 안에서 시작점을 미세조정할 수 있게 한다.
    - 반환: (clip_start, clip_duration). clip_start = 조각 내에서 나레이션이 시작하는 실측 앞 패딩.
    실패 시 RuntimeError(사용자용 메시지). 임시파일에 쓰고 성공 시 교체 → 실패해도 기존 조각 보존.
    """
    if '"' in src_abs or '"' in dst_abs:
        raise RuntimeError("경로에 사용할 수 없는 문자가 있습니다")
    src_dur = _ffprobe_duration(src_abs)
    if src_dur <= 0:
        raise RuntimeError("영상 정보를 읽을 수 없습니다. 다른 영상을 올려주세요.")
    if src_dur + CLIP_FIT_EPS < needed_sec:
        raise RuntimeError(
            f"원본 영상({src_dur:.1f}초)이 나레이션({needed_sec:.1f}초)보다 짧습니다. "
            f"더 긴 영상을 올려주세요."
        )
    # 나레이션 창(in_sec ~ in_sec+needed)이 원본 안에 들어오도록 클램프.
    in_sec = max(0.0, min(in_sec, src_dur - needed_sec))
    cut_start = max(0.0, in_sec - pad_sec)
    cut_end = min(src_dur, in_sec + needed_sec + pad_sec)
    cut_dur = cut_end - cut_start

    # 진단 + 4K 원본이면 다운스케일해 인코딩을 빠르게(긴 변 CLIP_CUT_MAX_LONG_SIDE 상한).
    codec, w, h = _probe_video_info(src_abs)
    print(f"[clip-cut] codec={codec or '?'} {w}x{h} dur={src_dur:.1f}s needed={needed_sec:.1f}s")
    scale = ""
    long_side = max(w, h)
    if long_side > CLIP_CUT_MAX_LONG_SIDE and w > 0 and h > 0:
        ratio = CLIP_CUT_MAX_LONG_SIDE / long_side
        tw = int(round(w * ratio / 2) * 2)
        th = int(round(h * ratio / 2) * 2)
        scale = f"-vf scale={tw}:{th} "

    tmp_abs = dst_abs + ".part.mp4"
    cmd = (
        f'{FFMPEG_Q} -y {_HWACCEL}-ss {cut_start:.3f} -i "{src_abs}" -t {cut_dur:.3f} '
        f"{scale}-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "
        f'"{tmp_abs}"'
    )
    # win32 는 문자열을 shell 없이 CreateProcess 로 직행, 그 외는 shlex.split(리스트). 양쪽 다
    # shell=False — cmd.exe 의 %VAR% 확장·POSIX $() 를 원천 회피(audio_utils.run 과 동일 관례).
    args = cmd if sys.platform == "win32" else shlex.split(cmd)
    try:
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode != 0:
            raise RuntimeError(f"영상 자르기 실패: {(result.stderr or '').strip()[-500:]}")
        clip_duration = _ffprobe_duration(tmp_abs)
        # 파일 끝 근처를 잘라 조각이 나레이션보다 짧게 나온 경쟁 상황 방어.
        if clip_duration + CLIP_FIT_EPS < needed_sec:
            raise RuntimeError("자른 영상이 나레이션보다 짧습니다. 앞쪽 구간을 선택해 다시 올려주세요.")
        _replace_with_retry(tmp_abs, dst_abs)
    finally:
        if os.path.exists(tmp_abs):
            try:
                os.remove(tmp_abs)
            except Exception:
                pass
    return (round(in_sec - cut_start, 3), round(clip_duration, 3))


def _trim_proxy_path(job_id: str) -> str:
    """선트림 모달의 저화질 미리보기 임시본 경로(잡당 1개). 확정/취소 시 삭제."""
    return os.path.join(settings.STORAGE_DIR, job_id, "clips", "_trim_proxy.mp4")


def _make_clip_proxy(src_abs: str, dst_abs: str) -> float:
    """원본을 저화질 H.264 미리보기본으로 변환(구간 고르는 동안 움직임 스크럽용).

    HEVC(폰 영상)는 Electron `<video>` 가 못 읽으므로, 백엔드 ffmpeg 가 H.264 로 낮춰 재생 가능하게 한다.
    360p·15fps·ultrafast 로 빠르게 만들고, mac 은 VideoToolbox 하드웨어 디코딩으로 HEVC 를 빠르게 푼다.
    반환: 임시본 길이(초, = 원본 길이). 실패 시 RuntimeError.
    """
    if '"' in src_abs or '"' in dst_abs:
        raise RuntimeError("경로에 사용할 수 없는 문자가 있습니다")
    codec, w, h = _probe_video_info(src_abs)
    print(f"[clip-proxy] codec={codec or '?'} {w}x{h}")
    tmp_abs = dst_abs + ".part.mp4"
    cmd = (
        f'{FFMPEG_Q} -y {_HWACCEL}-i "{src_abs}" '
        f"-vf scale=-2:360 -c:v libx264 -preset ultrafast -crf 30 -r 15 -an "
        f'-movflags +faststart "{tmp_abs}"'
    )
    # 자르기와 동일 관례: win32=문자열/그 외=shlex.split, 둘 다 shell 없이(경로 인젝션 차단).
    args = cmd if sys.platform == "win32" else shlex.split(cmd)
    try:
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode != 0:
            raise RuntimeError(f"미리보기 변환 실패: {(result.stderr or '').strip()[-400:]}")
        _replace_with_retry(tmp_abs, dst_abs)
    finally:
        if os.path.exists(tmp_abs):
            try:
                os.remove(tmp_abs)
            except Exception:
                pass
    return _ffprobe_duration(dst_abs)


def _convert_video_to_mp4(src_abs: str, dst_abs: str) -> None:
    """레거시(트림 없이 전체 저장) MOV/WebM/AVI → MP4 재인코딩. 동기 — 호출자가 to_thread 로 감쌀 것.

    _cut_clip_segment 와 동일한 shell 없는 관례로 실행(경로 인젝션 차단). 실패 시 RuntimeError.
    """
    cmd = (
        f'{FFMPEG_Q} -y -i "{src_abs}" '
        f"-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -an "
        f'"{dst_abs}"'
    )
    args = cmd if sys.platform == "win32" else shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "")[:300])


def _remove_trim_proxy(job_id: str) -> None:
    try:
        p = _trim_proxy_path(job_id)
        if os.path.exists(p):
            os.remove(p)
    except Exception:
        pass


def _job_asset_exists(job_id: str, relative_path: str) -> bool:
    local_path = os.path.join(settings.STORAGE_DIR, job_id, relative_path)
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return True
    if not is_r2_enabled():
        return False
    return r2_file_exists(r2_job_asset_key(job_id, relative_path))


def _job_asset_exists_any(job_id: str, relative_paths: list[str]) -> bool:
    return any(_job_asset_exists(job_id, rel) for rel in relative_paths)


def _line_asset_local_exists(job_dir: str, kind: str, line: dict, line_index: int) -> bool:
    return any(
        os.path.exists(os.path.join(job_dir, rel))
        for rel in line_asset_rel_candidates(kind, line, line_index)
    )


def _line_index_by_id(lines: list[dict], line_id: str) -> int | None:
    for i, line in enumerate(lines):
        if str(line.get("line_id")) == str(line_id):
            return i
    return None


def _all_lines_have_stable_ids(lines: list[dict]) -> bool:
    return all(str(line.get("line_id") or "").strip() for line in lines)


def _active_task_line_ids(db: Session, job_id: str, *, include_queued: bool = True) -> set[str]:
    statuses = ACTIVE_STATUSES if include_queued else ("running", "retrying")
    tasks = db.query(JobTask).filter(JobTask.job_id == job_id, JobTask.status.in_(statuses)).all()
    line_ids: set[str] = set()
    for task in tasks:
        payload = task_payload(task)
        if payload.get("current_line_id"):
            line_ids.add(str(payload["current_line_id"]))
        if task.kind == "card_b_missing_images":
            completed = set(str(v) for v in (payload.get("completed_line_ids") or []))
            for line_id in payload.get("line_ids") or []:
                if str(line_id) not in completed:
                    line_ids.add(str(line_id))
        elif payload.get("line_id"):
            line_ids.add(str(payload["line_id"]))
    return line_ids


def _raise_if_lines_have_active_tasks(db: Session, job_id: str, lines: list[dict], indexes: list[int], *, include_queued: bool = True) -> None:
    active_ids = _active_task_line_ids(db, job_id, include_queued=include_queued)
    if not active_ids:
        return
    for index in indexes:
        if 0 <= index < len(lines) and str(lines[index].get("line_id")) in active_ids:
            raise HTTPException(status_code=409, detail="AI 자산 생성이 진행 중인 줄입니다. 잠시 후 다시 시도하세요.")


def _set_line_source(job: Job, line_index: int, source: Literal["ai", "image", "clip"], *, status: str = "ready", fail_reason: Optional[str] = None, clip_meta: Optional[dict] = None) -> Optional[int]:
    """줄별 자산 출처와 상태를 Job에 기록. 호출 측에서 db.commit() 필요.

    clip_meta: 선트림 업로드가 {"clip_start", "clip_duration"} 을 넘기면, mark_line_asset_ready 가
    이전 조각 메타를 pop 한 **직후** 이 값으로 다시 써 넣는다(이 함수가 script_json 을 자체 로드/저장하므로
    반드시 여기서 넣어야 유실되지 않음).
    """
    sources = json.loads(job.line_sources_json or "[]")
    lines = json.loads(job.script_json or "[]")
    ensure_line_ids(lines)
    n = len(lines)
    # 길이 보정
    if len(sources) < n:
        sources = sources + ["ai"] * (n - len(sources))
    elif len(sources) > n:
        sources = sources[:n]
    if 0 <= line_index < n:
        sources[line_index] = source
        if status == "ready":
            mark_line_asset_ready(lines[line_index], bump_version=True)
            if clip_meta:
                lines[line_index].update(clip_meta)
        else:
            lines[line_index]["status"] = status
            lines[line_index]["fail_reason"] = fail_reason
            # 자산을 비우는 리셋(예: clear_line_clip)이므로 이전 조각/위치 메타는 무효 →
            # pop + 버전 bump(캐시버스트). ready 경로의 mark_line_asset_ready 와 동일 정리.
            lines[line_index].pop("transform", None)
            lines[line_index].pop("clip_start", None)
            lines[line_index].pop("clip_duration", None)
            bump_line_asset_version(lines[line_index])
            clear_line_asset_progress(lines[line_index])
    job.line_sources_json = json.dumps(sources, ensure_ascii=False)
    job.script_json = json.dumps(lines, ensure_ascii=False)
    invalidate_visual_plan(job)
    return lines[line_index].get("asset_version") if 0 <= line_index < n else None


def _is_ai_owned_asset(job_dir: str, line: dict, line_index: int, source: str) -> bool:
    """True when the current asset should be invalidated by AI prompt/text changes."""
    if source == "ai":
        return True
    if source == "clip":
        # AI image->video conversion keeps the source image; direct user video upload removes it.
        return _line_asset_local_exists(job_dir, "image", line, line_index)
    return False


async def _delete_line_assets_r2(job_id: str, line: dict, line_index: int) -> None:
    from core.r2_storage import delete_object as r2_delete, is_r2_enabled

    if not is_r2_enabled():
        return
    rels = (
        line_asset_rel_candidates("image", line, line_index)
        + line_asset_rel_candidates("clip", line, line_index)
    )
    for rel in dict.fromkeys(rels):
        await r2_delete(r2_job_asset_key(job_id, rel))


async def _discard_line_assets(job_id: str, job_dir: str, line: dict, line_index: int) -> None:
    _delete_line_assets(job_dir, line, line_index)
    await _delete_line_assets_r2(job_id, line, line_index)


def _pending_ai_line(text: str) -> dict:
    return {
        "line_id": new_line_id(),
        "text": text,
        "image_prompt": "",
        "motion": "none",  # 카드 B 기본: 움직임 없음(사용자가 줄별로 선택)
        "asset_version": 0,
        "status": "pending",
        "fail_reason": None,
    }


def _delete_line_assets(job_dir: str, line: dict, line_index: int) -> None:
    """제거되는 줄의 자산 파일을 best-effort 삭제."""
    rels = (
        line_asset_rel_candidates("image", line, line_index)
        + line_asset_rel_candidates("clip", line, line_index)
    )
    for rel in dict.fromkeys(rels):
        p = os.path.join(job_dir, rel)
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass


# ─────────────────────────────────────
# 카드 B: 카드 안에서 Enter로 줄 분할 + 텍스트 sync
# ─────────────────────────────────────


async def _promote_index_assets_to_line_ids(job_id: str, job_dir: str, lines: list[dict]) -> None:
    """Copy legacy index assets to stable line_id paths before structural edits."""
    from core.r2_storage import copy_object as r2_copy, is_r2_enabled, r2_file_exists

    r2_enabled = is_r2_enabled()
    for i, line in enumerate(lines):
        for kind in ("image", "clip"):
            stable_rel = line_asset_rel(kind, line, i)
            legacy_rel = legacy_line_asset_rel(kind, i)
            if stable_rel == legacy_rel:
                continue

            stable_path = os.path.join(job_dir, stable_rel)
            legacy_path = os.path.join(job_dir, legacy_rel)
            if not os.path.exists(stable_path) and os.path.exists(legacy_path):
                os.makedirs(os.path.dirname(stable_path), exist_ok=True)
                try:
                    shutil.copy2(legacy_path, stable_path)
                except Exception as e:
                    logger.warning("[line-id-assets] local promote failed job=%s rel=%s: %s", job_id, legacy_rel, e)

            if not r2_enabled:
                continue
            stable_key = r2_job_asset_key(job_id, stable_rel)
            legacy_key = r2_job_asset_key(job_id, legacy_rel)
            try:
                stable_exists = await asyncio.to_thread(r2_file_exists, stable_key)
                legacy_exists = False if stable_exists else await asyncio.to_thread(r2_file_exists, legacy_key)
                if not stable_exists and legacy_exists:
                    await r2_copy(legacy_key, stable_key)
            except Exception as e:
                logger.warning("[line-id-assets] R2 promote failed job=%s key=%s: %s", job_id, legacy_key, e)


async def _maybe_promote_index_assets_to_line_ids(
    job_id: str,
    job_dir: str,
    lines: list[dict],
    *,
    preexisting_line_ids: bool,
) -> None:
    if preexisting_line_ids:
        return
    await _promote_index_assets_to_line_ids(job_id, job_dir, lines)


async def _delete_line_asset_kind(job_id: str, job_dir: str, line: dict, line_index: int, kind: str) -> None:
    from core.r2_storage import delete_object as r2_delete, is_r2_enabled

    for rel in line_asset_rel_candidates(kind, line, line_index):
        p = os.path.join(job_dir, rel)
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
    if not is_r2_enabled():
        return
    for rel in line_asset_rel_candidates(kind, line, line_index):
        await r2_delete(r2_job_asset_key(job_id, rel))


@router.post("/{job_id}/split-line", response_model=SplitLineResponse)
async def split_line(
    body: SplitLineRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: line_index 위치를 before/after 두 줄로 분리. 이후 인덱스 자산 파일은 +1 시프트."""
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
    lines = json.loads(job.script_json or "[]")
    sources = json.loads(job.line_sources_json or "[]")
    preexisting_line_ids = _all_lines_have_stable_ids(lines)
    ensure_line_ids(lines)
    n = len(lines)
    if len(sources) != n:
        raise HTTPException(status_code=400, detail="줄별 자산 정보가 올바르지 않습니다")
    if not (0 <= body.line_index < n):
        raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")

    L = body.line_index
    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    _raise_if_lines_have_active_tasks(db, job_id, lines, [L])
    await _maybe_promote_index_assets_to_line_ids(job_id, job_dir, lines, preexisting_line_ids=preexisting_line_ids)
    cur = lines[L]
    source = sources[L]
    old_text = cur.get("text") or ""

    # Pressing Enter at either edge only inserts an empty card. The existing
    # line keeps its stable line_id and asset files, so ready media remains.
    if body.before == old_text and body.after == "":
        new_lines = lines[:L] + [cur, _pending_ai_line("")] + lines[L + 1:]
        new_sources = sources[:L] + [source, "ai"] + sources[L + 1:]
    elif body.before == "" and body.after == old_text:
        new_lines = lines[:L] + [_pending_ai_line(""), cur] + lines[L + 1:]
        new_sources = sources[:L] + ["ai", source] + sources[L + 1:]
    else:
        # 가운데 split: first 줄은 line_id·이미지·자산을 그대로 보존.
        # edit-line이 텍스트 변경 시 이미지를 유지하는 정책과 일관. 사용자가 이미지를 새 텍스트와
        # 다시 맞추려면 줄별 "AI 이미지 다시 생성" 버튼으로 명시적 재생성.
        first = {**cur, "text": body.before}
        first.pop("subtitle_chunks", None)  # 텍스트가 바뀐 앞줄은 자막 조각 리셋(뒷줄은 새 AI줄이라 애초에 없음)
        second = _pending_ai_line(body.after)
        new_lines = lines[:L] + [first, second] + lines[L + 1:]
        new_sources = sources[:L] + [source, "ai"] + sources[L + 1:]

    job.script_json = json.dumps(new_lines, ensure_ascii=False)
    job.line_sources_json = json.dumps(new_sources, ensure_ascii=False)
    invalidate_visual_plan(job)
    db.commit()

    return SplitLineResponse(
        lines=[ScriptLine(**l) for l in new_lines],
        sources=new_sources,
    )


@router.post("/{job_id}/edit-line")
async def edit_line(
    body: EditLineRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: 줄 텍스트 편집을 서버 script_json에 sync. 빈 문자열 허용."""
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")

    lines = json.loads(job.script_json or "[]")
    ids_changed = ensure_line_ids(lines)
    if not (0 <= body.line_index < len(lines)):
        raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")
    _raise_if_lines_have_active_tasks(db, job_id, lines, [body.line_index])
    old_text = lines[body.line_index].get("text") or ""
    if old_text == body.text:
        if ids_changed:
            invalidate_visual_plan(job)
        job.script_json = json.dumps(lines, ensure_ascii=False)
        db.commit()
        return {"ok": True}

    lines[body.line_index]["text"] = body.text
    # 텍스트가 바뀌면 자막 조각(subtitle_chunks)은 옛 문장 기준이라 무효 → 자동 분할로 리셋.
    lines[body.line_index].pop("subtitle_chunks", None)
    # 이미지 보존 정책: 텍스트가 바뀌어도 AI가 만든 이미지든 사용자 업로드든
    # 자산 파일·status·sources를 건드리지 않는다. 사용자가 명시적으로
    # regenerate-image를 누를 때만 재생성. (TTS는 confirm 시점에 변경 줄만 재합성.)
    # visual_plan은 텍스트 변경으로 stale해지므로 무효화 → 다음 이미지 생성 시 재도출.
    invalidate_visual_plan(job)
    job.script_json = json.dumps(lines, ensure_ascii=False)
    db.commit()
    return {"ok": True}


# 영상(clip) 줄은 팬/줌아웃 대신 "없음/서서히 확대"만 지원(process_user_clip 이 그 둘만 처리).
_CLIP_MOTIONS = {"none", "zoom_in"}
_IMAGE_MOTIONS = {"none"} | KEN_BURNS_MOTIONS


@router.post("/{job_id}/line-visual")
async def set_line_visual(
    body: LineVisualRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: 줄별 자산 위치/배율(transform)과 움직임(motion)을 저장.

    미디어 파일을 건드리지 않으므로 asset_version 을 올리지 않고(불필요한 캐시버스트 방지),
    visual_plan 도 무효화하지 않는다(위치/배율은 이미지 프롬프트와 무관). None 필드는 미변경.
    """
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")

    lines = json.loads(job.script_json or "[]")
    ensure_line_ids(lines)
    sources = json.loads(job.line_sources_json or "[]")

    # line_id 가 오면 우선 재해석(파일 대화상자·폴링 사이 순서가 바뀌어도 엉뚱한 줄 방지).
    idx = body.line_index
    if body.line_id:
        by_id = _line_index_by_id(lines, body.line_id)
        if by_id is not None:
            idx = by_id
    if not (0 <= idx < len(lines)):
        raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")

    line = lines[idx]
    src = sources[idx] if idx < len(sources) else "ai"

    saved_transform = None
    if body.transform is not None:
        saved_transform = normalize_transform(body.transform.model_dump())
        line["transform"] = saved_transform

    saved_motion = None
    if body.motion is not None:
        motion = body.motion.value
        allowed = _CLIP_MOTIONS if src == "clip" else _IMAGE_MOTIONS
        if motion not in allowed:
            raise HTTPException(status_code=400, detail="이 자산에 사용할 수 없는 움직임 효과입니다")
        line["motion"] = motion
        saved_motion = motion

    saved_clip_start = None
    if body.clip_start is not None:
        # 영상 조각의 재생 시작점 미세조정 — 파일은 그대로, 시작 오프셋만 바꾼다.
        if src != "clip":
            raise HTTPException(status_code=400, detail="영상 줄에만 시작점을 조정할 수 있습니다")
        cd = line.get("clip_duration")
        if not cd:
            raise HTTPException(status_code=400, detail="이 영상은 시작점 조정을 지원하지 않습니다(다시 업로드하면 사용 가능)")
        # 조각 끝을 최소 0.5초 남겨 둠. 나레이션 대비 초과는 여기서 막지 않고 confirm 검증에 맡긴다.
        line["clip_start"] = max(0.0, min(float(body.clip_start), max(0.0, float(cd) - 0.5)))
        saved_clip_start = line["clip_start"]

    job.script_json = json.dumps(lines, ensure_ascii=False)
    db.commit()
    return {"ok": True, "transform": saved_transform, "motion": saved_motion, "clip_start": saved_clip_start}


class SubtitleChunksRequest(BaseModel):
    """카드 B: 한 줄의 자막 조각(끊김)을 사용자가 확정. chunks=None 이면 자동 분할로 리셋."""
    line_id: str
    chunks: Optional[list[str]] = None


@router.post("/{job_id}/subtitle-chunks")
async def set_subtitle_chunks(
    body: SubtitleChunksRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: 줄별 자막 조각(끊는 위치)을 script_json 에 저장.

    프론트 화면·소리 단계에서 어절 사이를 눌러 끊음/합침을 확정할 때 호출된다.
    12자 초과 조각도 편집 중엔 저장한다(화면에서 경고 표시). 실제 차단은 confirm 에서. TTS 와 무관.
    """
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")

    lines = json.loads(job.script_json or "[]")
    ids_changed = ensure_line_ids(lines)
    idx = _line_index_by_id(lines, str(body.line_id or "").strip())
    if idx is None:
        raise HTTPException(status_code=404, detail="해당 줄을 찾을 수 없습니다")

    # 편집 중 임시 상태이므로 12자 초과 조각도 그대로 저장한다(사용자가 화면에서 경고를 보고 고칠 수 있게).
    # 실제 차단은 confirm(영상 만들기)에서 한다.
    if body.chunks is None:
        lines[idx].pop("subtitle_chunks", None)
    else:
        cleaned = [c for c in body.chunks if c and c.strip()]
        if not cleaned:
            raise HTTPException(status_code=400, detail="자막 조각이 비어 있습니다")
        lines[idx]["subtitle_chunks"] = cleaned

    if ids_changed:
        invalidate_visual_plan(job)
    job.script_json = json.dumps(lines, ensure_ascii=False)
    db.commit()
    return {"ok": True}


@router.post("/{job_id}/merge-line", response_model=SplitLineResponse)
async def merge_line(
    body: MergeLineRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: line_index 카드를 line_index-1 카드 끝에 이어 붙이고 line_index 카드를 제거.
    이후 인덱스 자산 파일은 -1 시프트.
    """
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
    lines = json.loads(job.script_json or "[]")
    sources = json.loads(job.line_sources_json or "[]")
    preexisting_line_ids = _all_lines_have_stable_ids(lines)
    ensure_line_ids(lines)
    n = len(lines)
    if len(sources) != n:
        raise HTTPException(status_code=400, detail="줄별 자산 정보가 올바르지 않습니다")
    if not (1 <= body.line_index < n):
        raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")

    L = body.line_index
    if not (lines[L].get("text") or "").strip():
        _raise_if_lines_have_active_tasks(db, job_id, lines, [L])
        job_dir = os.path.join(settings.STORAGE_DIR, job_id)
        await _maybe_promote_index_assets_to_line_ids(job_id, job_dir, lines, preexisting_line_ids=preexisting_line_ids)
        await _discard_line_assets(job_id, job_dir, lines[L], L)

        new_lines = lines[:L] + lines[L + 1:]
        new_sources = sources[:L] + sources[L + 1:]
        job.script_json = json.dumps(new_lines, ensure_ascii=False)
        job.line_sources_json = json.dumps(new_sources, ensure_ascii=False)
        invalidate_visual_plan(job)
        db.commit()

        return SplitLineResponse(
            lines=[ScriptLine(**l) for l in new_lines],
            sources=new_sources,
        )

    _raise_if_lines_have_active_tasks(db, job_id, lines, [L - 1, L])
    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    await _maybe_promote_index_assets_to_line_ids(job_id, job_dir, lines, preexisting_line_ids=preexisting_line_ids)
    # 텍스트 단순 연결 — 분할 때 보존된 공백을 그대로 복원
    lines[L - 1]["text"] = (lines[L - 1].get("text") or "") + (lines[L].get("text") or "")
    lines[L - 1].pop("subtitle_chunks", None)  # 합쳐진 윗줄은 문장이 바뀌었으니 자막 조각 리셋

    # merge: prev(L-1) 줄의 line_id·이미지·자산은 보존 (edit-line/split 정책과 일관).
    # 사라지는 L 줄의 자산만 정리. 사용자가 합쳐진 텍스트에 맞춰 이미지를 새로 만들고 싶으면
    # 줄별 "AI 이미지 다시 생성" 버튼으로 재생성.
    await _discard_line_assets(job_id, job_dir, lines[L], L)

    new_lines = lines[:L] + lines[L + 1:]
    new_sources = sources[:L] + sources[L + 1:]
    job.script_json = json.dumps(new_lines, ensure_ascii=False)
    job.line_sources_json = json.dumps(new_sources, ensure_ascii=False)
    invalidate_visual_plan(job)
    db.commit()

    return SplitLineResponse(
        lines=[ScriptLine(**l) for l in new_lines],
        sources=new_sources,
    )


@router.post("/{job_id}/delete-line", response_model=SplitLineResponse)
async def delete_line(
    body: DeleteLineRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: line_index 카드 자체를 제거. 이후 인덱스 자산 파일은 -1 시프트."""
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
    lines = json.loads(job.script_json or "[]")
    sources = json.loads(job.line_sources_json or "[]")
    preexisting_line_ids = _all_lines_have_stable_ids(lines)
    ensure_line_ids(lines)
    n = len(lines)
    if len(sources) != n:
        raise HTTPException(status_code=400, detail="줄별 자산 정보가 올바르지 않습니다")

    requested_line_id = str(body.line_id or "").strip()
    if requested_line_id:
        resolved = _line_index_by_id(lines, requested_line_id)
        if resolved is None:
            return SplitLineResponse(
                lines=[ScriptLine(**l) for l in lines],
                sources=sources,
            )
        if n <= 1:
            raise HTTPException(status_code=400, detail="마지막 줄은 삭제할 수 없습니다")
        L = resolved
    else:
        if n <= 1:
            raise HTTPException(status_code=400, detail="마지막 줄은 삭제할 수 없습니다")
        if not (0 <= body.line_index < n):
            raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")
        L = body.line_index
    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    _raise_if_lines_have_active_tasks(db, job_id, lines, [L])
    await _maybe_promote_index_assets_to_line_ids(job_id, job_dir, lines, preexisting_line_ids=preexisting_line_ids)
    removed_line = dict(lines[L])
    _delete_line_assets(job_dir, removed_line, L)
    if background_tasks is not None:
        background_tasks.add_task(_delete_line_assets_r2, job_id, removed_line, L)
    else:
        await _delete_line_assets_r2(job_id, removed_line, L)

    new_lines = lines[:L] + lines[L + 1:]
    new_sources = sources[:L] + sources[L + 1:]
    job.script_json = json.dumps(new_lines, ensure_ascii=False)
    job.line_sources_json = json.dumps(new_sources, ensure_ascii=False)
    invalidate_visual_plan(job)
    db.commit()

    return SplitLineResponse(
        lines=[ScriptLine(**l) for l in new_lines],
        sources=new_sources,
    )


@router.get("/{job_id}/preview", response_model=PreviewResponse)
async def get_preview(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """생성된 이미지 + 대본 미리보기"""
    job = get_user_job(db, job_id, _user)
    if job.status not in ("preview_ready", "awaiting_confirmation", "regenerating_image"):
        raise HTTPException(status_code=400, detail=f"미리보기 불가 (상태: {job.status})")

    raw_lines = json.loads(job.script_json)
    ids_changed = ensure_line_ids(raw_lines)
    if ids_changed:
        job.script_json = json.dumps(raw_lines, ensure_ascii=False)
        db.commit()
    lines = [ScriptLine(**l) for l in raw_lines]
    image_urls = [f"/api/jobs/{job_id}/images/{i}" for i in range(len(lines))]

    return PreviewResponse(title=job.title, lines=lines, image_urls=image_urls)


@router.get("/{job_id}/visual-plan")
async def get_visual_plan_debug(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 디버그: AI에 넘어간 visual plan/줄별 프롬프트/QA 결과 확인."""
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")

    lines = json.loads(job.script_json or "[]")
    sources = json.loads(job.line_sources_json or "[]")
    plan = parse_visual_plan(getattr(job, "visual_plan_json", ""))
    suffix = style_suffix(job.style)
    current_hash = visual_plan_script_hash(lines)

    debug_lines = []
    for i, line in enumerate(lines):
        prompt = line.get("image_prompt") or ""
        final_prompt = f"{prompt}, {suffix}" if prompt and suffix else prompt
        debug_lines.append({
            "index": i + 1,
            "line_id": line.get("line_id"),
            "text": line.get("text") or "",
            "source": sources[i] if i < len(sources) else "ai",
            "status": line.get("status"),
            "visual_anchor": line.get("visual_anchor"),
            "visual_intent": line.get("visual_intent"),
            "reference_line_index": line.get("reference_line_index"),
            "image_prompt": prompt,
            "final_image_prompt": final_prompt,
            "motion": line.get("motion"),
            "qa_status": line.get("qa_status"),
            "qa_result": line.get("qa_result"),
        })

    return {
        "job_id": job_id,
        "plan_valid": bool(plan) and plan.get("script_hash") == current_hash,
        "current_script_hash": current_hash,
        "plan_script_hash": plan.get("script_hash"),
        "inferred_topic": plan.get("inferred_topic"),
        "narrative_summary": plan.get("narrative_summary"),
        "visual_bible": plan.get("visual_bible"),
        "continuity_anchors": plan.get("continuity_anchors"),
        "plan_lines": plan.get("lines", []),
        "lines": debug_lines,
    }


def _assert_no_emoji(job, body: dict | None = None) -> None:
    """제목/대본에 이모지가 있으면 친절 400으로 차단.

    영상 자막은 ffmpeg drawtext(단일 폰트)라 컬러 이모지를 못 그려 두부(□)로 깨지고,
    일부 환경에선 인코딩 오류도 난다. 그래서 영상 제작 직전에 막는다.
    body 가 있으면(confirm) 방금 보낸 제목을, 없으면(confirm-clips) job 에 저장된 제목을
    검사한다. 대본은 항상 job.script_json 의 각 줄 text 를 본다.
    """
    candidates: list[str] = []
    if body:
        for key in ("title", "title_line1", "title_line2"):
            val = body.get(key)
            if isinstance(val, str):
                candidates.append(val)
    else:
        for val in (job.title, job.title_line1, job.title_line2):
            if isinstance(val, str):
                candidates.append(val)
    try:
        lines = json.loads(job.script_json or "[]")
    except Exception:
        lines = []
    for line in lines:
        if isinstance(line, dict) and isinstance(line.get("text"), str):
            candidates.append(line["text"])
    if any(contains_emoji(t) for t in candidates):
        raise HTTPException(
            status_code=400,
            detail="제목이나 대본에 이모지가 포함되어 있어요. 이모지를 삭제한 뒤 다시 제작해주세요.",
        )


@router.post("/{job_id}/confirm")
async def confirm_and_render(
    request: Request,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """미리보기 확인 → AI 영상이면 클립 생성, Ken Burns면 바로 영상 조립.

    카드 B(generation_mode == 'user_assets')일 때는 body에 voice_id, bgm 등
    음성/BGM 설정이 함께 전송된다. 이 시점에서 Job을 보강하고 자산 실재를 검증한다.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    video_mode = body.get("video_mode", "kenburns") or "kenburns"

    job = get_user_job(db, job_id, _user)
    _assert_no_emoji(job, body)
    job_dir = os.path.join(settings.STORAGE_DIR, job.id)
    if job.status not in ("preview_ready", "awaiting_confirmation"):
        raise HTTPException(status_code=400, detail=f"확정 불가 (상태: {job.status})")
    _require_generation_storage()

    # ─── 카드 B 분기: 자산 실재 검증 + 음성/BGM 설정 흡수 ───
    if job.generation_mode == "user_assets":
        lines = json.loads(job.script_json or "[]")
        ids_changed = ensure_line_ids(lines)
        sources = json.loads(job.line_sources_json or "[]")
        if len(sources) != len(lines):
            raise HTTPException(status_code=400, detail="줄별 자산 정보가 올바르지 않습니다")

        for i, src in enumerate(sources):
            if lines[i].get("status") != "ready":
                raise HTTPException(status_code=400, detail=f"{i + 1}번째 줄의 자산이 아직 준비되지 않았습니다")
            if src == "clip":
                if not _job_asset_exists_any(job_id, line_asset_rel_candidates("clip", lines[i], i)):
                    raise HTTPException(status_code=400, detail=f"{i + 1}번째 줄에 영상이 없습니다")
            else:  # "ai" or "image"
                if not _job_asset_exists_any(job_id, line_asset_rel_candidates("image", lines[i], i)):
                    raise HTTPException(status_code=400, detail=f"{i + 1}번째 줄에 이미지가 없습니다")
        if ids_changed:
            job.script_json = json.dumps(lines, ensure_ascii=False)

        # 음성/BGM 설정 흡수
        job.video_mode = "kenburns"  # 카드 B는 ai_clips 경로 미사용 (사용자 업로드 영상은 별도 분기)
        if body.get("voice_id"):
            job.voice_id = body["voice_id"]
        if body.get("tts_engine"):
            job.tts_engine = body["tts_engine"]
        if body.get("tts_speed") is not None:
            job.tts_speed = float(body["tts_speed"])
        if body.get("emotion") is not None:
            job.emotion = body["emotion"]
        if body.get("tts_session_id"):
            job.tts_session_id = body["tts_session_id"]
        if body.get("bgm_filename") is not None:
            job.bgm_filename = body["bgm_filename"]
        if body.get("bgm_start_sec") is not None:
            job.bgm_start_sec = float(body["bgm_start_sec"])
        if body.get("bgm_volume") is not None:
            job.bgm_volume = float(body["bgm_volume"])
        if body.get("title_line1") is not None:
            job.title_line1 = body["title_line1"]
        if body.get("title_line2") is not None:
            job.title_line2 = body["title_line2"]
        # 제목 폰트/크기. 폰트 id 유효성은 렌더 시 resolve_title_font_path 가 폴백 처리하므로
        # 여기선 문자열만 받는다. 크기는 raw JSON 이라 숫자 아님/NaN 방어 + 70~170 clamp.
        if body.get("title_font") is not None:
            job.title_font = str(body["title_font"])
        if body.get("title_font_weight") is not None:
            job.title_font_weight = str(body["title_font_weight"])
        if body.get("title_font_size") is not None:
            try:
                _sz = int(float(body["title_font_size"]))
                job.title_font_size = max(70, min(170, _sz))
            except (TypeError, ValueError):
                pass  # 잘못된 값은 무시 → 기본(120) 사용
        # 제목 색. 사용자 입력이 drawtext 필터에 박히므로 여기서 #RRGGBB 로 정규화(1차 방어).
        if body.get("title_color1") is not None:
            job.title_color1 = normalize_hex(body["title_color1"], DEFAULT_TITLE_COLOR1)
        if body.get("title_color2") is not None:
            job.title_color2 = normalize_hex(body["title_color2"], DEFAULT_TITLE_COLOR2)
        # 제목 위치 오프셋(드래그) — 자막 위치와 동일하게 클램프 헬퍼가 담당.
        apply_title_pos(job, dx=body.get("title_dx"), dy=body.get("title_dy"))
        # 제목 줄별 크기·줄 간격 — 헬퍼가 클램프. None=title_font_size/기존 공식 폴백(레거시 불변).
        apply_title_sizes(
            job,
            line1=body.get("title_line1_size"),
            line2=body.get("title_line2_size"),
            gap=body.get("title_line_gap"),
        )
        # title이 비어 있으면 video_assembler.py:306의 조건(if title_text and font_title)을
        # 통과하지 못해 제목 자체가 영상에 안 박힌다. 카드 B draft는 title=""로 시작하므로 여기서 흡수.
        if body.get("title") is not None:
            job.title = body["title"]

        # 자막 스타일(폰트/굵기/크기/색/위치) — 제목과 동일하게 여기서 흡수(클램프는 헬퍼가 담당).
        apply_subtitle_style(
            job,
            font=body.get("subtitle_font"),
            weight=body.get("subtitle_font_weight"),
            size=body.get("subtitle_font_size"),
            color=body.get("subtitle_color"),
            dx=body.get("subtitle_dx"),
            y=body.get("subtitle_y"),
        )
        # 줌(모션) 속도 — 작업 전역. 자막 스타일과 동일하게 confirm 시 흡수.
        apply_motion_speed(job, body.get("motion_speed"))

        # 자막 조각 확정(WYSIWYG): 프론트가 화면에 보여준 줄별 조각을 line_id 맵으로 보낸다.
        # 여기서 script_json 에 확정 저장 → 렌더가 자동 분할 없이 이 경계 그대로 자막을 박는다.
        # 12자 초과 조각이 하나라도 있으면 영상이 화면 밖으로 넘치므로 400 으로 막는다(사용자에게 어느 줄인지 안내).
        chunks_map = body.get("subtitle_chunks_by_line")
        if isinstance(chunks_map, dict):
            from core.subtitle_utils import display_len, MAX_DISPLAY
            for i, line in enumerate(lines):
                lid = str(line.get("line_id") or "")
                if lid and lid in chunks_map:
                    raw = chunks_map[lid]
                    if not isinstance(raw, list):
                        continue
                    cleaned = [c for c in raw if isinstance(c, str) and c.strip()]
                    if not cleaned:
                        continue
                    # 조각 안의 개행("\n")은 화면 줄바꿈 — 줄별로 나눠 12자 판정(프론트와 동일).
                    over = next(
                        (
                            c
                            for c in cleaned
                            if any(display_len(ln) > MAX_DISPLAY for ln in c.split("\n"))
                        ),
                        None,
                    )
                    if over is not None:
                        raise HTTPException(
                            status_code=400,
                            detail=f"{i + 1}번째 줄 자막이 화면보다 길어요. 화면·소리 단계에서 더 잘게 끊어주세요.",
                        )
                    line["subtitle_chunks"] = cleaned
        job.script_json = json.dumps(lines, ensure_ascii=False)

        # TTS 세션 디렉터리가 별도에 있으면 job_dir/tts/로 이동
        if not job.tts_session_id:
            raise HTTPException(status_code=400, detail="나레이션 음성이 생성되지 않았습니다. 음성 설정 단계에서 '나레이션 음성 만들기'를 먼저 실행해주세요.")

        if len(job.tts_session_id) != 12 or any(c not in "0123456789abcdef" for c in job.tts_session_id):
            raise HTTPException(status_code=400, detail="TTS 세션 ID가 올바르지 않습니다. 음성 설정 단계에서 다시 생성해주세요.")

        tts_session_dir = os.path.join(settings.STORAGE_DIR, "tts_sessions", job.tts_session_id)
        timings_path = os.path.join(job_dir, "tts", "timings_raw.json")

        # 선트림 조각 백스톱: 대본 수정으로 나레이션이 조각보다 길어졌으면 여기서 막는다.
        # (정상 경로에선 프론트 buildVoices 감지가 이미 삭제 안내했으므로 도달은 드물다. 세션 이동 전에 읽는다.)
        _dpath = os.path.join(tts_session_dir if os.path.exists(tts_session_dir) else os.path.join(job_dir, "tts"), "timings_raw.json")
        try:
            with open(_dpath, encoding="utf-8") as f:
                _raw = json.load(f)
            _durs = [e.get("duration") for e in _raw] if isinstance(_raw, list) else []
        except Exception:
            _durs = []
        if len(_durs) == len(lines):
            _conf = _find_clip_conflicts(lines, json.loads(job.line_sources_json or "[]"), _durs)
            if _conf:
                c = _conf[0]
                raise HTTPException(
                    status_code=400,
                    detail=f"{c['index'] + 1}번째 줄 영상이 나레이션보다 짧아요. 화면·소리 단계에서 그 줄 영상을 다시 잘라 올려주세요.",
                )

        if job.tts_session_id:
            if os.path.exists(tts_session_dir):
                import shutil
                tts_dst = os.path.join(job_dir, "tts")
                os.makedirs(tts_dst, exist_ok=True)
                try:
                    for fname in os.listdir(tts_session_dir):
                        shutil.move(os.path.join(tts_session_dir, fname), os.path.join(tts_dst, fname))
                    os.rmdir(tts_session_dir)
                except Exception as e:
                    job.tts_session_id = None
                    print(f"[confirm user_assets] TTS 세션 이동 실패, 재생성 경로로 폴백: {e}")
                    raise HTTPException(status_code=500, detail="TTS 세션을 작업 폴더로 이동하지 못했습니다. 음성 설정 단계에서 다시 생성해주세요.")
            elif not os.path.exists(timings_path):
                raise HTTPException(status_code=400, detail="TTS 세션 파일을 찾을 수 없습니다. 음성 설정 단계에서 다시 생성해주세요.")

        job.status = "awaiting_confirmation"
        job.current_step = "영상 제작 준비 중..."
        db.commit()
        _remove_trim_proxy(job_id)  # 확정됐으니 선트림 미리보기 임시본 정리(디스크 잔여물 방지)
        task, already_running = enqueue_task(
            db,
            job=job,
            kind="render_video",
            payload={},
            dedupe_key="render",
            max_attempts=80,
        )
        return {"message": "영상 제작을 시작합니다", "job_id": job_id, "next": "render", "task_id": task.id, "already_running": already_running}

    # ─── 카드 A: 기존 흐름 ───
    job.video_mode = video_mode

    if video_mode in ("hailuo", "hailuo23", "wan", "kling", "veo", "veo_lite"):
        # AI 영상 모드: 이미지 확인 → AI 클립 생성 단계로
        job.status = "generating_clips"
        job.current_step = "AI 영상 클립 생성 준비 중..."
        db.commit()
        task, already_running = enqueue_task(
            db,
            job=job,
            kind="card_a_clips",
            payload={},
            dedupe_key="card_a_clips",
            max_attempts=80,
        )
        return {"message": "AI 영상 클립 생성을 시작합니다", "job_id": job_id, "next": "clips", "task_id": task.id, "already_running": already_running}
    else:
        # Ken Burns 모드: 바로 영상 조립
        job.status = "awaiting_confirmation"
        job.current_step = "영상 제작 준비 중..."
        db.commit()
        task, already_running = enqueue_task(
            db,
            job=job,
            kind="render_video",
            payload={},
            dedupe_key="render",
            max_attempts=80,
        )
        return {"message": "영상 제작을 시작합니다", "job_id": job_id, "next": "render", "task_id": task.id, "already_running": already_running}


class RegenerateRequest(BaseModel):
    korean_request: Optional[str] = None
    english_prompt: Optional[str] = None


@router.post("/{job_id}/regenerate-image/{line_index}")
async def regenerate_image(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    line_index: int = 0,
    body: RegenerateRequest = RegenerateRequest(),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """특정 이미지 재생성 (한글 요청어 → 영어 프롬프트 변환).

    카드 B에서는 Job 전체 상태를 바꾸지 않는다(한 줄 실패가 Job 전체 실패로 번지면 안 됨).
    """
    job = get_user_job(db, job_id, _user)
    _require_generation_storage()

    lines = json.loads(job.script_json)
    ids_changed = ensure_line_ids(lines)
    if line_index < 0 or line_index >= len(lines):
        raise HTTPException(status_code=400, detail="잘못된 이미지 인덱스")

    if job.generation_mode != "user_assets":
        if ids_changed:
            job.script_json = json.dumps(lines, ensure_ascii=False)
        job.status = "regenerating_image"
        db.commit()
    else:
        if job.status != "preview_ready":
            raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
        _raise_if_lines_have_active_tasks(db, job_id, lines, [line_index])
        if not (lines[line_index].get("text") or "").strip():
            raise HTTPException(status_code=400, detail="빈 텍스트 줄은 이미지 생성할 수 없습니다")
        # 줄별 상태만 'pending'으로 표시 (UI에 로딩 스피너 등)
        set_line_asset_progress(lines[line_index], "ai_image", "queued", "AI 이미지 생성 대기 중")
        job.script_json = json.dumps(lines, ensure_ascii=False)
        db.commit()

    line_id = lines[line_index].get("line_id")
    task, already_running = enqueue_task(
        db,
        job=job,
        kind="regenerate_image",
        payload={
            "line_index": line_index,
            "line_id": line_id,
            "korean_request": body.korean_request,
            "english_prompt": body.english_prompt,
        },
        dedupe_key=f"image:{line_id or line_index}",
        max_attempts=80,
    )
    return {
        "message": f"이미지 {line_index + 1} 재생성 시작",
        "task_id": task.id,
        "already_running": already_running,
    }


@router.post("/{job_id}/generate-missing-images")
async def generate_missing_images(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """카드 B 전용: line_sources가 'ai'이고 이미지 파일이 없는 줄을 일괄 생성한다."""
    job = get_user_job(db, job_id, _user)
    _require_generation_storage()
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")

    existing = get_active_task(db, job_id, kind="card_b_missing_images", dedupe_key="missing_images")
    if existing:
        payload = task_payload(existing)
        queued_ids = set(payload.get("line_ids") or [])
        current_lines = json.loads(job.script_json or "[]")
        queued_indexes = [
            i for i, line in enumerate(current_lines)
            if str(line.get("line_id")) in queued_ids
        ]
        return {
            "queued": queued_indexes,
            "task_id": existing.id,
            "status": existing.status,
            "already_running": True,
        }

    lines = json.loads(job.script_json or "[]")
    ids_changed = ensure_line_ids(lines)
    sources = json.loads(job.line_sources_json or "[]")
    if len(sources) != len(lines):
        raise HTTPException(status_code=400, detail="줄별 자산 정보가 올바르지 않습니다")

    images_dir = os.path.join(settings.STORAGE_DIR, job_id, "images")
    os.makedirs(images_dir, exist_ok=True)

    queued = []
    queued_line_ids = []
    for i, src in enumerate(sources):
        if src != "ai":
            continue
        if not (lines[i].get("text") or "").strip():
            raise HTTPException(status_code=400, detail=f"{i + 1}번째 줄이 비어 있습니다")
        has_asset = _job_asset_exists_any(job_id, line_asset_rel_candidates("image", lines[i], i))
        if has_asset:
            if lines[i].get("status") != "ready":
                mark_line_asset_ready(lines[i])
            continue
        queued.append(i)
        queued_line_ids.append(str(lines[i].get("line_id")))
        set_line_asset_progress(lines[i], "ai_image", "queued", "AI 이미지 생성 대기 중")

    job.script_json = json.dumps(lines, ensure_ascii=False)
    if ids_changed:
        invalidate_visual_plan(job)
    db.commit()

    task = None
    already_running = False
    if queued:
        task, already_running = enqueue_task(
            db,
            job=job,
            kind="card_b_missing_images",
            payload={
                "line_indexes": queued,
                "line_ids": queued_line_ids,
                "completed_line_ids": [],
            },
            dedupe_key="missing_images",
            max_attempts=120,
        )

    return {
        "queued": queued,
        "task_id": task.id if task else None,
        "status": task.status if task else "completed",
        "already_running": already_running,
    }


@router.post("/{job_id}/upload-image/{line_index}")
async def upload_image(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    line_index: int = 0,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """사용자 이미지 업로드 — AI 이미지 대체"""
    job = get_user_job(db, job_id, _user)
    _require_generation_storage()
    lines = json.loads(job.script_json)
    ensure_line_ids(lines)
    ensure_line_ids(lines)
    if line_index < 0 or line_index >= len(lines):
        raise HTTPException(status_code=400, detail="잘못된 이미지 인덱스")
    if job.generation_mode == "user_assets":
        _raise_if_lines_have_active_tasks(db, job_id, lines, [line_index])

    if file.content_type not in ("image/png", "image/jpeg", "image/webp"):
        raise HTTPException(status_code=400, detail="PNG, JPG, WebP 이미지만 업로드 가능합니다")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="파일 크기는 10MB 이하만 가능합니다")

    img = Image.open(io.BytesIO(contents))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")

    if job.generation_mode == "user_assets":
        # 카드 B: 왜곡·잘림 없이 원본 비율 보존. 프리뷰에서 사용자가 위치·배율을 정하고,
        # 최종 렌더가 transform 대로 배치한다. 여기서는 용량만 제한(긴 변 2560px 캡).
        MAX_LONG_SIDE = 2560
        w, h = img.size
        if max(w, h) > MAX_LONG_SIDE:
            if w >= h:
                img = img.resize((MAX_LONG_SIDE, max(1, round(h * MAX_LONG_SIDE / w))), Image.LANCZOS)
            else:
                img = img.resize((max(1, round(w * MAX_LONG_SIDE / h)), MAX_LONG_SIDE), Image.LANCZOS)
    else:
        # 카드 A: 기존 동작 유지 — 9:16 비율로 cover-crop 후 1080×1920.
        target_w, target_h = 1080, 1920
        target_ratio = target_w / target_h

        src_w, src_h = img.size
        src_ratio = src_w / src_h

        if src_ratio > target_ratio:
            new_w = int(src_h * target_ratio)
            offset = (src_w - new_w) // 2
            img = img.crop((offset, 0, offset + new_w, src_h))
        else:
            new_h = int(src_w / target_ratio)
            offset = (src_h - new_h) // 2
            img = img.crop((0, offset, src_w, offset + new_h))

        img = img.resize((target_w, target_h), Image.LANCZOS)

    line = lines[line_index]
    image_rel = line_asset_rel("image", line, line_index)
    output_path = os.path.join(settings.STORAGE_DIR, job_id, image_rel)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG")

    from core.r2_storage import upload_file as r2_upload, is_r2_enabled
    if is_r2_enabled():
        ok = await r2_upload(output_path, r2_job_asset_key(job_id, image_rel))
        if not ok:
            raise HTTPException(status_code=500, detail="R2 이미지 업로드 실패")

    asset_version = None
    # 카드 B: 줄별 자산 출처/상태 갱신 + 이전 클립 파일 정리
    if job.generation_mode == "user_assets":
        job_dir = os.path.join(settings.STORAGE_DIR, job_id)
        await _delete_line_asset_kind(job_id, job_dir, line, line_index, "clip")
        asset_version = _set_line_source(job, line_index, "image", status="ready")
        db.commit()

    return {
        "message": f"이미지 {line_index + 1} 업로드 완료",
        "image_url": f"/api/jobs/{job_id}/images/{line_index}",
        "asset_version": asset_version,
    }


async def _render_video_task(job_id: str):
    """백그라운드: TTS + 영상 조립"""
    from jobs_queue.worker import render_video_for_job

    await render_video_for_job(job_id)


async def _generate_clips_task(job_id: str):
    """백그라운드: AI 영상 클립 생성"""
    from jobs_queue.worker import generate_clips_for_job

    await generate_clips_for_job(job_id)


async def _regenerate_single_image(job_id: str, line_index: int, korean_request: str = None, english_prompt: str = None):
    """백그라운드: 단일 이미지 재생성"""
    from jobs_queue.worker import regenerate_image_for_job

    await _mark_ai_started(job_id, line_index)
    try:
        await regenerate_image_for_job(job_id, line_index, korean_request, english_prompt)
    finally:
        await _mark_ai_finished(job_id, line_index)


# ─────────────────────────────────────
# AI 클립 미리보기 / 재생성 / 확인
# ─────────────────────────────────────


@router.get("/{job_id}/clip-preview", response_model=ClipPreviewResponse)
async def get_clip_preview(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """AI 클립 미리보기 데이터"""
    job = get_user_job(db, job_id, _user)
    if job.status not in ("clips_ready", "awaiting_confirmation"):
        raise HTTPException(status_code=400, detail=f"클립 미리보기 불가 (상태: {job.status})")

    raw_lines = json.loads(job.script_json)
    ids_changed = ensure_line_ids(raw_lines)
    if ids_changed:
        job.script_json = json.dumps(raw_lines, ensure_ascii=False)
        db.commit()
    lines = [ScriptLine(**l) for l in raw_lines]
    clip_urls = [f"/api/jobs/{job_id}/clips/{i}" for i in range(len(lines))]
    image_urls = [f"/api/jobs/{job_id}/images/{i}" for i in range(len(lines))]

    return ClipPreviewResponse(title=job.title, lines=lines, clip_urls=clip_urls, image_urls=image_urls)


@router.get("/{job_id}/clips/{index}")
async def get_clip_file(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    index: int = 0,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """개별 클립 파일 서빙"""
    from fastapi.responses import StreamingResponse
    from core.r2_storage import is_r2_enabled, r2_file_exists, stream_from_r2

    job = get_user_job(db, job_id, _user)
    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    lines = json.loads(job.script_json or "[]")
    ensure_line_ids(lines)
    if not (0 <= index < len(lines)):
        raise HTTPException(status_code=404, detail="클립 파일 없음")

    for rel in line_asset_rel_candidates("clip", lines[index], index):
        r2_key = r2_job_asset_key(job_id, rel)
        if is_r2_enabled() and r2_file_exists(r2_key):
            return StreamingResponse(stream_from_r2(r2_key), media_type="video/mp4")

        clip_path = os.path.join(job_dir, rel)
        if os.path.exists(clip_path):
            return FileResponse(clip_path, media_type="video/mp4")

    raise HTTPException(status_code=404, detail="클립 파일 없음")


@router.post("/{job_id}/regenerate-clip/{line_index}")
async def regenerate_clip(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    line_index: int = 0,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """특정 AI 클립 재생성"""
    job = get_user_job(db, job_id, _user)
    _require_generation_storage()

    lines = json.loads(job.script_json)
    if line_index < 0 or line_index >= len(lines):
        raise HTTPException(status_code=400, detail="잘못된 클립 인덱스")

    if job.generation_mode == "user_assets":
        if job.status != "preview_ready":
            raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
        _raise_if_lines_have_active_tasks(db, job_id, lines, [line_index])

        sources = json.loads(job.line_sources_json or "[]")
        if len(sources) != len(lines):
            raise HTTPException(status_code=400, detail="줄별 자산 정보가 올바르지 않습니다")
        if sources[line_index] not in ("ai", "image"):
            raise HTTPException(status_code=400, detail="이미지가 준비된 줄만 AI 영상으로 변환할 수 있습니다")
        if lines[line_index].get("status") != "ready":
            raise HTTPException(status_code=400, detail="이미지가 준비된 줄만 AI 영상으로 변환할 수 있습니다")

        job_dir = os.path.join(settings.STORAGE_DIR, job_id)
        if not _job_asset_exists_any(job_id, line_asset_rel_candidates("image", lines[line_index], line_index)):
            raise HTTPException(status_code=400, detail=f"{line_index + 1}번째 줄에 이미지가 없습니다")

        await _delete_line_asset_kind(job_id, job_dir, lines[line_index], line_index, "clip")

        set_line_asset_progress(lines[line_index], "ai_clip", "queued", "AI 영상 변환 대기 중")
        job.script_json = json.dumps(lines, ensure_ascii=False)
        db.commit()

    line_id = lines[line_index].get("line_id")
    task, already_running = enqueue_task(
        db,
        job=job,
        kind="regenerate_clip",
        payload={"line_index": line_index, "line_id": line_id},
        dedupe_key=f"clip:{line_id or line_index}",
        max_attempts=80,
    )
    return {
        "message": f"클립 {line_index + 1} 재생성 시작",
        "task_id": task.id,
        "already_running": already_running,
    }


@router.post("/{job_id}/confirm-clips")
async def confirm_clips_and_render(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """AI 클립 확인 → TTS + 영상 조립 시작"""
    job = get_user_job(db, job_id, _user)
    _assert_no_emoji(job)
    if job.status not in ("clips_ready", "awaiting_confirmation"):
        raise HTTPException(status_code=400, detail=f"확정 불가 (상태: {job.status})")
    _require_generation_storage()

    job.status = "awaiting_confirmation"
    job.current_step = "영상 제작 준비 중..."
    db.commit()

    task, already_running = enqueue_task(
        db,
        job=job,
        kind="render_video",
        payload={},
        dedupe_key="render",
        max_attempts=80,
    )
    return {"message": "영상 제작을 시작합니다", "job_id": job_id, "task_id": task.id, "already_running": already_running}


@router.post("/{job_id}/upload-clip/{line_index}")
async def upload_clip(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    line_index: int = 0,
    file: UploadFile = File(...),
    # 선트림 업로드(웹 폴백): 둘 다 오면 선택 구간(+여유분)만 잘라 저장. 없으면 기존 동작(전체 저장).
    in_sec: Optional[float] = Form(None),
    needed_sec: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """사용자 영상 업로드 — AI 클립 대체. in_sec/needed_sec 이 오면 선트림(구간만 잘라 저장)."""
    job = get_user_job(db, job_id, _user)
    _require_generation_storage()

    lines = json.loads(job.script_json)
    ensure_line_ids(lines)
    if line_index < 0 or line_index >= len(lines):
        raise HTTPException(status_code=400, detail="잘못된 클립 인덱스")
    if job.generation_mode == "user_assets":
        _raise_if_lines_have_active_tasks(db, job_id, lines, [line_index])

    allowed_types = ("video/mp4", "video/quicktime", "video/webm", "video/x-msvideo")
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="MP4, MOV, WebM, AVI 영상만 업로드 가능합니다")

    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="파일 크기는 50MB 이하만 가능합니다")

    clips_dir = os.path.join(settings.STORAGE_DIR, job_id, "clips")
    os.makedirs(clips_dir, exist_ok=True)
    line = lines[line_index]
    clip_rel = line_asset_rel("clip", line, line_index)
    output_path = os.path.join(settings.STORAGE_DIR, job_id, clip_rel)

    clip_meta: Optional[dict] = None
    do_trim = in_sec is not None and needed_sec is not None and needed_sec > 0
    # 선트림은 카드 B(user_assets) 전용 — 카드 A 는 clip_meta 를 저장하지 않아 조각 시작점이
    # 유실되므로(패딩 앞부터 렌더) 방어적으로 거부한다(현 UI 에선 도달 불가).
    if do_trim and job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업에서는 구간을 잘라 업로드할 수 없습니다")
    # 입력 임시파일은 고유명으로(두 줄 동시 업로드가 서로 덮어쓰지 않게 — 변환을 to_thread 로
    # 돌리면 진짜 동시 실행되므로 필수). 재인코딩(자르기·MP4 변환)은 무거워 이벤트 루프를 막지
    # 않도록 to_thread 로 오프로드한다(웹/R2 다중 사용자에서 요청·SSE 정지 방지).
    if do_trim:
        # 선트림: 원본을 임시 저장 후 선택 구간(+여유분)만 재인코딩으로 잘라 output_path 에 저장.
        # 나레이션 길이는 서버 권위(timings_raw.json)로 재검증 — 클라 값이 오래됐어도 정확히 자른다.
        needed = _tts_needed_sec(job, line_index, float(needed_sec))
        ext = {
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
            "video/webm": ".webm",
            "video/x-msvideo": ".avi",
        }.get(file.content_type or "", ".tmp")
        tmp_path = os.path.join(clips_dir, f"_upload_{uuid.uuid4().hex[:8]}{ext}")
        with open(tmp_path, "wb") as f:
            f.write(contents)
        try:
            cs, cd = await asyncio.to_thread(
                _cut_clip_segment, tmp_path, output_path, float(in_sec), needed
            )
            clip_meta = {"clip_start": cs, "clip_duration": cd}
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    elif file.content_type == "video/mp4":
        # (레거시 전체 저장) MP4는 그대로 저장
        with open(output_path, "wb") as f:
            f.write(contents)
    else:
        # (레거시 전체 저장) MOV/WebM/AVI → FFmpeg로 MP4 변환
        ext = {
            "video/quicktime": ".mov",
            "video/webm": ".webm",
            "video/x-msvideo": ".avi",
        }.get(file.content_type, ".tmp")

        tmp_path = os.path.join(clips_dir, f"_upload_{uuid.uuid4().hex[:8]}{ext}")
        with open(tmp_path, "wb") as f:
            f.write(contents)

        try:
            await asyncio.to_thread(_convert_video_to_mp4, tmp_path, output_path)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=f"영상 변환 실패: {str(e)[:200]}")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    # 영상 최소 길이 검사 (0.5초 미만 거부) — TTS 길이와의 정밀 비교는 조립 단계에서 수행
    duration = _ffprobe_duration(output_path)
    if duration < 0.5:
        try:
            os.remove(output_path)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"영상이 너무 짧습니다 ({duration:.2f}초). 1초 이상 영상을 올려주세요.")

    from core.r2_storage import upload_file as r2_upload, is_r2_enabled
    clip_output = output_path
    if is_r2_enabled() and os.path.exists(clip_output):
        ok = await r2_upload(clip_output, r2_job_asset_key(job_id, clip_rel))
        if not ok:
            raise HTTPException(status_code=500, detail="R2 영상 업로드 실패")

    asset_version = None
    # 카드 B: 줄별 자산 출처/상태 갱신 + 이전 이미지 파일 정리
    if job.generation_mode == "user_assets":
        job_dir = os.path.join(settings.STORAGE_DIR, job_id)
        await _delete_line_asset_kind(job_id, job_dir, line, line_index, "image")
        asset_version = _set_line_source(job, line_index, "clip", status="ready", clip_meta=clip_meta)
        db.commit()

    return {
        "message": f"클립 {line_index + 1} 업로드 완료",
        "clip_url": f"/api/jobs/{job_id}/clips/{line_index}",
        "asset_version": asset_version,
        "clip_start": clip_meta["clip_start"] if clip_meta else None,
        "clip_duration": clip_meta["clip_duration"] if clip_meta else None,
    }


def _find_clip_conflicts(lines: list[dict], sources: list, durations: list, *, eps: float = CLIP_FIT_EPS) -> list[dict]:
    """clip 줄 중 나레이션(durations[i])이 조각 사용가능 길이(clip_duration - clip_start)보다 긴 것.

    레거시 클립(clip_duration 없음)은 스킵 — 파일 실측 기반 assembler 검증이 최후 방어.
    반환: [{index, line_id, needed, available}].
    """
    out: list[dict] = []
    n = min(len(lines), len(durations))
    for i in range(n):
        src = sources[i] if i < len(sources) else "ai"
        if src != "clip":
            continue
        cd = lines[i].get("clip_duration")
        if not cd:
            continue
        cs = float(lines[i].get("clip_start") or 0.0)
        avail = float(cd) - cs
        needed = float(durations[i] or 0.0)
        if avail + eps < needed:
            out.append({"index": i, "line_id": lines[i].get("line_id"), "needed": needed, "available": avail})
    return out


def _tts_needed_sec(job: Job, idx: int, fallback: float) -> float:
    """줄 idx 의 나레이션 길이(초)를 TTS 세션 timings_raw.json 에서 조회(서버 권위).

    엔트리 수가 대본 줄 수와 다르거나 세션이 없으면 fallback(프론트가 보낸 값)을 쓴다.
    """
    from api.routes.tts_preview import TTS_SESSIONS_DIR

    sid = str(job.tts_session_id or "").strip()
    if not sid:
        return fallback
    path = os.path.join(TTS_SESSIONS_DIR, sid, "timings_raw.json")
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        n_lines = len(json.loads(job.script_json or "[]"))
        if isinstance(raw, list) and len(raw) == n_lines and 0 <= idx < len(raw):
            dur = raw[idx].get("duration") if isinstance(raw[idx], dict) else None
            if dur and float(dur) > 0:
                return float(dur)
    except Exception:
        pass
    return fallback


class ImportClipSegmentRequest(BaseModel):
    """카드 B 데스크톱 선트림: 원본 경로에서 선택 구간(+여유분)만 잘라 임포트."""
    line_index: int = Field(..., ge=0)
    line_id: Optional[str] = None          # 있으면 우선 재해석(레이스 안전)
    src_path: str = Field(..., min_length=1)
    in_sec: float = Field(..., ge=0)       # 원본 기준 나레이션 창 시작(초)
    needed_sec: float = Field(..., gt=0)   # 프론트가 아는 나레이션 길이(서버 조회 실패 시 폴백)


@router.post("/{job_id}/import-clip-segment")
async def import_clip_segment(
    body: ImportClipSegmentRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """데스크톱 전용: 로컬 원본 영상 경로에서 구간만 잘라 저장(전송 없이).

    HTTP 바디에 파일이 없으므로 용량 제한과 무관 — 4GB 원본도 몇 초 조각만 저장된다.
    보안: 임의 파일을 서버가 읽는 통로이므로 LOCAL_SINGLE_USER(데스크톱) 에서만 연다.
    """
    if not settings.LOCAL_SINGLE_USER:
        raise HTTPException(status_code=403, detail="이 기능은 데스크톱 앱에서만 사용할 수 있습니다")

    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
    _require_generation_storage()

    lines = json.loads(job.script_json or "[]")
    ensure_line_ids(lines)
    idx = body.line_index
    if body.line_id:
        by_id = _line_index_by_id(lines, body.line_id)
        if by_id is not None:
            idx = by_id
    if not (0 <= idx < len(lines)):
        raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")
    _raise_if_lines_have_active_tasks(db, job_id, lines, [idx])

    # 원본 경로 검증 — 파일 존재 + 확장자 화이트리스트 + 따옴표 배제(명령 인젝션 방지).
    src = body.src_path
    if '"' in src or not os.path.isfile(src):
        raise HTTPException(status_code=400, detail="영상 파일을 찾을 수 없습니다")
    if os.path.splitext(src)[1].lower() not in CLIP_IMPORT_EXTS:
        raise HTTPException(status_code=400, detail="MP4, MOV, WebM, AVI 영상만 사용할 수 있습니다")

    needed = _tts_needed_sec(job, idx, body.needed_sec)

    clips_dir = os.path.join(settings.STORAGE_DIR, job_id, "clips")
    os.makedirs(clips_dir, exist_ok=True)
    line = lines[idx]
    clip_rel = line_asset_rel("clip", line, idx)
    output_path = os.path.join(settings.STORAGE_DIR, job_id, clip_rel)

    try:
        cs, cd = await asyncio.to_thread(_cut_clip_segment, src, output_path, float(body.in_sec), float(needed))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    from core.r2_storage import upload_file as r2_upload, is_r2_enabled
    if is_r2_enabled() and os.path.exists(output_path):
        ok = await r2_upload(output_path, r2_job_asset_key(job_id, clip_rel))
        if not ok:
            raise HTTPException(status_code=500, detail="R2 영상 업로드 실패")

    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    await _delete_line_asset_kind(job_id, job_dir, line, idx, "image")
    asset_version = _set_line_source(
        job, idx, "clip", status="ready",
        clip_meta={"clip_start": cs, "clip_duration": cd},
    )
    db.commit()
    _remove_trim_proxy(job_id)  # 확정됐으니 미리보기 임시본 정리

    return {
        "message": f"클립 {idx + 1} 임포트 완료",
        "clip_url": f"/api/jobs/{job_id}/clips/{idx}",
        "asset_version": asset_version,
        "clip_start": cs,
        "clip_duration": cd,
    }


class ClipProxyRequest(BaseModel):
    """카드 B 데스크톱: 원본 경로에서 저화질 미리보기본을 생성(구간 고르는 동안 재생용)."""
    src_path: str = Field(..., min_length=1)


@router.post("/{job_id}/clip-proxy")
async def make_clip_proxy(
    body: ClipProxyRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """데스크톱 전용: 로컬 원본을 저화질 H.264 미리보기본으로 변환(HEVC 등 폰 영상 재생용).

    최종 영상엔 원본을 원화질로 잘라 쓴다(이 임시본은 미리보기 전용, 확정/취소 시 삭제).
    """
    if not settings.LOCAL_SINGLE_USER:
        raise HTTPException(status_code=403, detail="이 기능은 데스크톱 앱에서만 사용할 수 있습니다")
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")
    _require_generation_storage()

    src = body.src_path
    if '"' in src or not os.path.isfile(src):
        raise HTTPException(status_code=400, detail="영상 파일을 찾을 수 없습니다")
    if os.path.splitext(src)[1].lower() not in CLIP_IMPORT_EXTS:
        raise HTTPException(status_code=400, detail="MP4, MOV, WebM, AVI 영상만 사용할 수 있습니다")

    proxy_abs = _trim_proxy_path(job_id)
    os.makedirs(os.path.dirname(proxy_abs), exist_ok=True)
    try:
        dur = await asyncio.to_thread(_make_clip_proxy, src, proxy_abs)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 캐시버스터는 나노초 mtime — 같은 초 안에 다른 원본으로 재변환해도 URL 이 달라져
    # 이전 프록시가 <video> 캐시로 잘못 재생되지 않게 한다.
    ver = os.stat(proxy_abs).st_mtime_ns if os.path.exists(proxy_abs) else 0
    return {
        "proxy_url": f"/api/jobs/{job_id}/clip-proxy-file?v={ver}",
        "duration": dur,
    }


@router.get("/{job_id}/clip-proxy-file")
async def get_clip_proxy_file(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """저화질 미리보기 임시본 스트리밍(Range 지원 — 스크럽용). 잡 소유자만."""
    get_user_job(db, job_id, _user)
    proxy_abs = _trim_proxy_path(job_id)
    if not os.path.exists(proxy_abs):
        raise HTTPException(status_code=404, detail="미리보기가 없습니다")
    return FileResponse(proxy_abs, media_type="video/mp4")


@router.post("/{job_id}/clip-proxy/cleanup")
async def cleanup_clip_proxy(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """미리보기 임시본 삭제(모달 취소/닫기 시 호출). 없으면 조용히 통과."""
    get_user_job(db, job_id, _user)
    _remove_trim_proxy(job_id)
    return {"ok": True}


class ClearLineClipRequest(BaseModel):
    """카드 B: 한 줄의 영상 자산을 삭제하고 AI 대기 상태로 되돌린다(부족 정책 실행용)."""
    line_index: int = Field(..., ge=0)
    line_id: Optional[str] = None


@router.post("/{job_id}/clear-line-clip")
async def clear_line_clip(
    body: ClearLineClipRequest,
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """줄의 영상 자산을 삭제하고 source="ai"/status="pending" 으로 리셋.

    대본이 길어져 영상이 나레이션보다 짧아졌을 때 프론트가 호출한다(사용자가 다시 잘라 올리도록).
    """
    job = get_user_job(db, job_id, _user)
    if job.generation_mode != "user_assets":
        raise HTTPException(status_code=400, detail="이 작업은 카드 B 모드가 아닙니다")
    if job.status != "preview_ready":
        raise HTTPException(status_code=409, detail=f"카드 편집 단계가 아닙니다 (상태: {job.status})")

    lines = json.loads(job.script_json or "[]")
    ensure_line_ids(lines)
    idx = body.line_index
    if body.line_id:
        by_id = _line_index_by_id(lines, body.line_id)
        if by_id is not None:
            idx = by_id
    if not (0 <= idx < len(lines)):
        raise HTTPException(status_code=400, detail="잘못된 줄 인덱스")
    _raise_if_lines_have_active_tasks(db, job_id, lines, [idx])

    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    await _discard_line_assets(job_id, job_dir, lines[idx], idx)
    # source=ai + status=pending 으로 리셋(버전 bump 로 캐시버스트, clip/ transform 메타는 pop).
    asset_version = _set_line_source(job, idx, "ai", status="pending")
    db.commit()

    return {"ok": True, "asset_version": asset_version}


async def _regenerate_single_clip(job_id: str, line_index: int):
    """백그라운드: 단일 AI 클립 재생성"""
    from jobs_queue.worker import regenerate_clip_for_job

    await _mark_ai_started(job_id, line_index)
    try:
        await regenerate_clip_for_job(job_id, line_index)
    finally:
        await _mark_ai_finished(job_id, line_index)


async def _regenerate_missing_images_sequence(job_id: str, line_indexes: list[int]):
    """백그라운드: 카드 B 빈 AI 이미지 줄을 순서대로 생성."""
    from jobs_queue.worker import regenerate_missing_images_for_job

    for i in line_indexes:
        await _mark_ai_started(job_id, i)
    try:
        await regenerate_missing_images_for_job(job_id, line_indexes)
    finally:
        for i in line_indexes:
            await _mark_ai_finished(job_id, i)
