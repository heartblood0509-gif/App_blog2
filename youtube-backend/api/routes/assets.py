"""이미지/영상/BGM 파일 서빙 API"""

import json
import os
import shutil
import subprocess
import tempfile

from fastapi import APIRouter, HTTPException, Path, Query, Depends, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse
from sqlalchemy.orm import Session
from config import settings
from core.video_assembler import get_duration
from core.r2_storage import (
    is_r2_enabled, r2_file_exists, stream_from_r2,
    generate_presigned_url, upload_file as r2_upload, require_r2_for_generation,
)
from core.user_assets_visual import ensure_line_ids, line_asset_rel_candidates, r2_job_asset_key
from core.ffmpeg import FFPROBE
from core.time_utils import utc_now_naive
from api.deps import get_approved_user, get_user_job
from db.database import get_db
from db.models import Job, User, UserBgm

router = APIRouter(prefix="/api/jobs", tags=["assets"])
bgm_router = APIRouter(prefix="/api/assets", tags=["bgm"])


def resolve_asset_line(lines: list, idx: int, line_id: str | None) -> int | None:
    """자산을 서빙할 줄의 현재 인덱스. line_id 가 오면 그쪽이 우선.

    이 API 들은 원래 줄 번호(idx)로만 자산을 찾았다. 줄 순서가 절대 안 바뀌던 시절엔 맞았지만,
    순서 변경(드래그)이 생기면서 두 가지가 깨졌다.
      · 순서를 바꿔도 URL 이 그대로라 브라우저가 옛 이미지를 캐시에서 꺼내 쓴다.
      · 화면(새 순서)과 서버(아직 옛 순서) 사이 시차에 엉뚱한 줄 자산이 나간다.
    그래서 호출부가 line_id 를 함께 보내면 그 줄로 직접 해석한다. 못 찾으면 예전처럼 idx 로
    폴백해 기존 URL(카드 A 미리보기 등)도 그대로 동작한다.

    반환은 '현재 인덱스' — 옛 인덱스 파일명(img_00.png) 폴백에 그 값이 필요하기 때문이다.
    """
    if line_id:
        for i, line in enumerate(lines):
            if str(line.get("line_id") or "") == line_id:
                return i
        return None  # 방금 지워진 줄 등 — idx 로 폴백하면 남의 자산이 나간다
    return idx if 0 <= idx < len(lines) else None


def _mark_expired_if_old(db: Session, job_id: str):
    """파일이 없고 30일 지난 작업이면 만료 표시"""
    if settings.LOCAL_SINGLE_USER:
        return  # 로컬 단일사용자: 30일 만료 미적용("받아도 계속 수정")
    job = db.query(Job).filter(Job.id == job_id).first()
    if job and job.completed_at and not job.files_expired_at:
        age = utc_now_naive() - job.completed_at
        if age.days >= 30:
            job.files_expired_at = utc_now_naive()
            job.video_path = None
            db.commit()


# ── 이미지/영상 서빙 ──


@router.get("/{job_id}/images/{idx}")
async def get_image(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    idx: int = Path(..., ge=0, le=100),
    line_id: str | None = Query(None, max_length=64),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """생성된 이미지 파일 서빙. line_id 를 주면 줄 번호가 아니라 그 줄로 찾는다(순서 변경 안전)."""
    job = get_user_job(db, job_id, _user)
    job_dir = os.path.join(settings.STORAGE_DIR, job_id)
    lines = json.loads(job.script_json or "[]")
    ensure_line_ids(lines)
    idx = resolve_asset_line(lines, idx, line_id)
    if idx is None:
        _mark_expired_if_old(db, job_id)
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")

    for rel in line_asset_rel_candidates("image", lines[idx], idx):
        r2_key = r2_job_asset_key(job_id, rel)
        if is_r2_enabled() and r2_file_exists(r2_key):
            return StreamingResponse(stream_from_r2(r2_key), media_type="image/png")

        path = os.path.join(job_dir, rel)
        if os.path.exists(path):
            return FileResponse(path, media_type="image/png")

    _mark_expired_if_old(db, job_id)
    raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다")


@router.get("/{job_id}/video")
async def get_video(
    job_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """최종 영상 파일 서빙"""
    get_user_job(db, job_id, _user)
    path = os.path.join(settings.STORAGE_DIR, job_id, "output", "shorts_final.mp4")

    if os.path.exists(path):
        # 재제작 시 같은 URL 이라도 항상 최신 파일을 받도록 매번 재검증(no-cache).
        # ETag(파일 mtime+size 기반)가 바뀌면 새 영상이, 같으면 304 로 캐시가 재사용된다.
        return FileResponse(
            path,
            media_type="video/mp4",
            filename=f"shorts_{job_id}.mp4",
            headers={"Cache-Control": "no-cache"},
        )

    r2_key = f"jobs/{job_id}/output/shorts_final.mp4"
    if is_r2_enabled() and r2_file_exists(r2_key):
        url = generate_presigned_url(r2_key)
        return RedirectResponse(url)

    _mark_expired_if_old(db, job_id)
    raise HTTPException(status_code=404, detail="영상을 찾을 수 없습니다")


# ── BGM 관련 엔드포인트 ──


def _safe_bgm_name(name: str | None) -> str:
    """업로드/조회 파일명을 BGM_DIR 안에 안전하게 가두기 위한 basename 검증.

    공격자가 보낸 multipart filename(예: ../../evil)을 그대로 경로에 붙이면 디렉터리
    밖에 파일을 쓰거나 읽을 수 있다(path traversal). 경로 구분자·상위 참조·널바이트를
    모두 거부하고 순수 파일명만 허용한다.
    """
    raw = (name or "").strip()
    base = os.path.basename(raw)
    if (
        not base
        or base in (".", "..")
        or base != raw          # 디렉터리 성분이 있으면 거부 (예: ../x, a/b)
        or "/" in base
        or "\\" in base
        or "\x00" in base
    ):
        raise HTTPException(status_code=400, detail="잘못된 파일 이름입니다")
    return base


def _bgm_path_within(name: str) -> str:
    """BGM_DIR 안의 안전한 절대경로 반환. 경계를 벗어나면 403.

    basename 검증(_safe_bgm_name) + realpath/commonpath 로 실제 경계까지 이중 확인.
    """
    safe = _safe_bgm_name(name)
    base_dir = os.path.realpath(settings.BGM_DIR)
    full = os.path.realpath(os.path.join(base_dir, safe))
    if base_dir != os.path.commonpath([base_dir, full]):
        raise HTTPException(status_code=403, detail="접근 불가")
    return full


def _probe_audio(filepath: str) -> float:
    """ffprobe로 오디오 파일 검증 + duration 반환. 실패 시 예외."""
    try:
        result = subprocess.run(
            [FFPROBE, "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        info = json.loads(result.stdout)
        return float(info["format"]["duration"])
    except Exception:
        raise ValueError("유효한 오디오 파일이 아닙니다")


@bgm_router.get("/bgm", response_model=list)
async def list_bgm(db: Session = Depends(get_db), _user: User = Depends(get_approved_user)):
    """BGM 파일 목록 반환 (R2 활성: DB 조회, 비활성: 로컬 스캔)"""
    if is_r2_enabled():
        # DB에서 사용자의 BGM 목록 조회
        bgms = db.query(UserBgm).filter(UserBgm.user_id == _user.id).order_by(UserBgm.created_at.desc()).all()
        return [
            {
                "id": b.id,
                "filename": b.filename,
                "duration": round(b.duration, 1),
                "url": f"/api/assets/bgm/{b.id}",
            }
            for b in bgms
        ]
    else:
        # 로컬 개발: bgm/ 폴더 스캔
        bgm_dir = settings.BGM_DIR
        if not os.path.isdir(bgm_dir):
            return []
        files = []
        for fname in sorted(os.listdir(bgm_dir)):
            if fname.lower().endswith((".mp3", ".wav", ".ogg")):
                fpath = os.path.join(bgm_dir, fname)
                try:
                    duration = get_duration(fpath)
                except Exception:
                    duration = 0
                files.append({
                    "filename": fname,
                    "duration": round(duration, 1),
                    "url": f"/api/assets/bgm/{fname}",
                })
        return files


@bgm_router.post("/bgm")
async def upload_bgm(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """BGM 업로드 → ffprobe 검증 → R2 저장 → DB 기록"""
    try:
        require_r2_for_generation()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    # 파일명 정규화(보안): path traversal 차단. 이후 모든 경로/DB 에 safe_name 만 사용.
    safe_name = _safe_bgm_name(file.filename)
    # 확장자 체크
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in (".mp3", ".wav", ".ogg"):
        raise HTTPException(status_code=400, detail="MP3, WAV, OGG 파일만 업로드 가능합니다")

    # 개수 제한 (최대 3개)
    if is_r2_enabled():
        count = db.query(UserBgm).filter(UserBgm.user_id == _user.id).count()
    else:
        bgm_dir = settings.BGM_DIR
        count = len([f for f in os.listdir(bgm_dir) if f.lower().endswith(('.mp3', '.wav', '.ogg'))]) if os.path.exists(bgm_dir) else 0
    if count >= 3:
        raise HTTPException(status_code=400, detail="BGM은 최대 3개까지 업로드 가능합니다")

    # 크기 체크
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="파일 크기는 20MB 이하만 가능합니다")

    # 중복 체크
    existing = db.query(UserBgm).filter(
        UserBgm.user_id == _user.id,
        UserBgm.filename == safe_name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="같은 이름의 BGM이 이미 있습니다")

    # 임시 파일에 저장 + ffprobe 검증
    tmp_dir = os.path.join(settings.STORAGE_DIR, "tmp_bgm")
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_path = os.path.join(tmp_dir, safe_name)

    try:
        with open(tmp_path, "wb") as f:
            f.write(contents)

        # ffprobe로 실제 오디오 검증 + duration 추출
        try:
            duration = _probe_audio(tmp_path)
        except ValueError:
            raise HTTPException(status_code=400, detail="유효한 오디오 파일이 아닙니다")

        r2_key = f"bgm/{_user.id}/{safe_name}"
        if is_r2_enabled():
            # R2 활성: R2 업로드 + DB 기록 (DB 가 source of truth)
            ok = await r2_upload(tmp_path, r2_key)
            if not ok:
                raise HTTPException(status_code=500, detail="파일 업로드에 실패했습니다")
            bgm = UserBgm(
                user_id=_user.id,
                filename=safe_name,
                duration=duration,
                r2_key=r2_key,
            )
            db.add(bgm)
            db.commit()
            db.refresh(bgm)
            return {"id": bgm.id, "filename": bgm.filename, "duration": round(duration, 1)}

        # 로컬 모드(R2 off): 검증된 파일을 BGM_DIR 로 영구 이동.
        # list_bgm/get_bgm_file/count/delete 가 모두 BGM_DIR 을 본다 → 파일시스템이 source of truth.
        # (기존 코드는 여기서 tmp 만 지워 업로드한 BGM 이 사라지는 버그였음 — B1)
        os.makedirs(settings.BGM_DIR, exist_ok=True)
        dest_path = _bgm_path_within(safe_name)
        if os.path.exists(dest_path):
            raise HTTPException(status_code=409, detail="같은 이름의 BGM이 이미 있습니다")
        shutil.move(tmp_path, dest_path)
        return {"filename": safe_name, "duration": round(duration, 1)}

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@bgm_router.delete("/bgm/{bgm_id}")
async def delete_bgm(
    bgm_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """BGM 삭제 (본인 것만)"""
    # 로컬 모드(R2 off): 파일시스템이 source of truth. bgm_id 를 파일명으로 보고 BGM_DIR 에서 삭제.
    if not is_r2_enabled():
        abs_path = _bgm_path_within(bgm_id)  # path traversal 차단 + 경계 검증
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="BGM을 찾을 수 없습니다")
        os.remove(abs_path)
        return {"message": "BGM이 삭제되었습니다"}

    bgm = db.query(UserBgm).filter(UserBgm.id == bgm_id).first()
    if not bgm:
        raise HTTPException(status_code=404, detail="BGM을 찾을 수 없습니다")
    if bgm.user_id != _user.id and _user.role != "admin":
        raise HTTPException(status_code=404, detail="BGM을 찾을 수 없습니다")

    # R2 삭제
    if is_r2_enabled():
        from core.r2_storage import get_r2_client
        try:
            get_r2_client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=bgm.r2_key)
        except Exception:
            pass

    db.delete(bgm)
    db.commit()
    return {"message": "BGM이 삭제되었습니다"}


@bgm_router.get("/bgm/{bgm_id_or_filename:path}")
async def get_bgm_file(
    bgm_id_or_filename: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """BGM 파일 서빙 (R2 활성: 스트리밍, 비활성: 로컬)"""
    if is_r2_enabled():
        # DB에서 ID로 조회
        bgm = db.query(UserBgm).filter(UserBgm.id == bgm_id_or_filename).first()
        if not bgm:
            # filename으로 시도
            bgm = db.query(UserBgm).filter(
                UserBgm.user_id == _user.id,
                UserBgm.filename == bgm_id_or_filename,
            ).first()
        if not bgm:
            raise HTTPException(status_code=404, detail="BGM 파일을 찾을 수 없습니다")
        if bgm.user_id != _user.id and _user.role != "admin":
            raise HTTPException(status_code=404, detail="BGM 파일을 찾을 수 없습니다")

        if r2_file_exists(bgm.r2_key):
            # presigned URL로 리다이렉트 (Range Request 지원)
            url = generate_presigned_url(bgm.r2_key)
            if url:
                return RedirectResponse(url)
            return StreamingResponse(stream_from_r2(bgm.r2_key), media_type="audio/mpeg")
        raise HTTPException(status_code=404, detail="BGM 파일을 찾을 수 없습니다")
    else:
        # 로컬 개발 모드 — path traversal 차단 + 경계 검증.
        abs_path = _bgm_path_within(bgm_id_or_filename)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="BGM 파일을 찾을 수 없습니다")
        return FileResponse(abs_path, media_type="audio/mpeg")
