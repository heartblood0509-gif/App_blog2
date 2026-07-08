"""TTS 음성 미리듣기 엔드포인트"""

import asyncio
import json
import os
import re
import shutil
import tempfile
import uuid

from fastapi import APIRouter, Query, HTTPException, Depends, Path
from fastapi.responses import FileResponse

import requests as http_requests

from sqlalchemy.orm import Session
from config import settings
from core.ffmpeg import FFPROBE
from core.audio_utils import normalize_to_browser_wav, is_playable_wav
from core.tts_engines import generate_tts_typecast, generate_tts_for_indices
from core.line_splitter import (
    detect_overlong_lines,
    split_long_line_with_gemini,
    split_by_punctuation,
)
from core.audio_splitter import (
    calculate_split_point,
    cut_wav_at,
    get_wav_duration,
)
from core.user_assets_visual import line_text_hash
from core.app_control import is_app_control_block, SAC_MESSAGE_VOICE
from api.deps import get_approved_user, resolve_user_api_keys
from api.models import TtsPreviewBuildRequest
from db.database import get_db
from db.models import User

router = APIRouter(prefix="/api/tts", tags=["tts"])

# 세션별 동시 빌드 방지 (per-process). 다중 워커 환경에선 파일락 보강 필요.
_BUILD_LOCKS: dict[str, asyncio.Lock] = {}


def _get_session_lock(session_id: str) -> asyncio.Lock:
    lock = _BUILD_LOCKS.get(session_id)
    if lock is None:
        lock = asyncio.Lock()
        _BUILD_LOCKS[session_id] = lock
    return lock

TTS_SESSIONS_DIR = os.path.join(settings.STORAGE_DIR, "tts_sessions")
LINE_DURATION_THRESHOLD = 6.0  # veo 3.1 lite 클립당 6초 고정 제약

PREVIEW_DIR = os.path.join(settings.STORAGE_DIR, "tts_preview")
SAMPLE_TEXT = "안녕하세요, 반갑습니다."

_SAFE_FILENAME = re.compile(r"^[\w\-]+$")


def _cache_path(user_id: str, engine: str, voice_id: str, speed: float, emotion: str) -> str:
    safe_id = voice_id.replace("-", "_")
    # Typecast 응답은 실제로 WAV 다. 예전엔 .mp3 로 저장+audio/mpeg 로 서빙해
    # "내용은 WAV 인데 라벨은 MP3" 가 되어 엄격한 브라우저(Safari/WebKit)가
    # "no supported source" 로 재생 거부했다. 정직하게 .wav 로 저장 → audio/wav 서빙.
    return os.path.join(
        PREVIEW_DIR,
        f"{user_id}_{engine}_{safe_id}_s{speed}_{emotion}.wav"
    )


EMOTION_LABELS = {
    "normal": "보통", "happy": "기쁨", "sad": "슬픔", "angry": "화남",
    "whisper": "속삭임", "toneup": "밝게", "tonedown": "차분하게",
    "tonemid": "중간톤", "regret": "후회", "urgent": "급박한",
    "scream": "외침", "shout": "소리침", "trustful": "신뢰감",
    "soft": "부드럽게", "cold": "차갑게", "sarcasm": "비꼼",
    "inspire": "영감", "cute": "귀엽게", "cheer": "응원", "casual": "캐주얼",
}


@router.get("/emotions")
async def get_voice_emotions(voice_id: str = Query(..., min_length=1), db: Session = Depends(get_db), _user: User = Depends(get_approved_user)):
    """Typecast 성우의 지원 감정 목록 반환"""
    keys = resolve_user_api_keys(db, _user.id)
    tc_key = keys["typecast"]
    if not tc_key:
        raise HTTPException(500, "Typecast API 키가 설정되지 않았습니다. 설정 페이지에서 키를 입력하세요.")

    resp = http_requests.get(
        f"https://api.typecast.ai/v1/voices/{voice_id}",
        headers={"X-API-KEY": tc_key},
    )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, "성우 정보 조회 실패")

    # 보통 → 긍정 → 부정 → 특수 순서
    EMOTION_ORDER = [
        "normal",
        "happy", "cheer", "toneup", "inspire", "cute", "casual", "trustful", "soft",
        "sad", "angry", "cold", "sarcasm", "regret", "tonedown", "tonemid",
        "whisper", "urgent", "scream", "shout",
    ]

    raw_emotions = []
    entries = resp.json()
    # ssfm-v30 우선, 없으면 ssfm-v21 사용
    for entry in entries:
        if entry.get("model") == "ssfm-v30":
            raw_emotions = entry.get("emotions", [])
            break
    if not raw_emotions:
        for entry in entries:
            if entry.get("model") == "ssfm-v21":
                raw_emotions = entry.get("emotions", [])
                break

    order_map = {e: i for i, e in enumerate(EMOTION_ORDER)}
    sorted_emotions = sorted(raw_emotions, key=lambda e: order_map.get(e, 99))

    return [
        {"value": e, "label": EMOTION_LABELS.get(e, e)}
        for e in sorted_emotions
    ]


@router.get("/preview")
async def tts_preview(
    engine: str = Query(..., pattern="^typecast$"),
    voice_id: str = Query(..., min_length=1, max_length=100),
    speed: float = Query(default=1.0, ge=0.5, le=2.0),
    emotion: str = Query(default="normal", max_length=20),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """선택한 엔진+음성+속도+감정으로 샘플 오디오 생성/반환"""
    keys = resolve_user_api_keys(db, _user.id)
    if not keys["typecast"]:
        raise HTTPException(400, "Typecast API 키가 설정되지 않았습니다. 설정 페이지에서 사용자 본인의 키를 입력하세요.")

    if not _SAFE_FILENAME.match(voice_id.replace("-", "_").replace(".", "_")):
        raise HTTPException(400, "잘못된 voice_id 형식입니다")

    os.makedirs(PREVIEW_DIR, exist_ok=True)
    cached = _cache_path(_user.id, engine, voice_id, speed, emotion)

    # 같은 캐시 키(성우·속도·감정)의 동시 요청 직렬화 — 중복 생성과 tmp 경합 방지.
    lock = _get_session_lock(cached)
    async with lock:
        # 캐시 히트: 서빙 전 구조 검증. 불량(잘림·HTML·MP3·비-PCM)이면 삭제 후 재생성으로 폴백
        # → 한 번 박힌 손상 캐시가 다음 클릭에 자동 복구된다(자가치유).
        if os.path.exists(cached):
            if is_playable_wav(cached):
                return FileResponse(cached, media_type="audio/wav")
            try:
                os.remove(cached)
            except OSError:
                pass

        # 요청마다 고유한 tmp 디렉토리 — 동시 요청의 finally rmtree가 서로를 지우지 않게.
        tmp_dir = tempfile.mkdtemp(prefix=f"tmp_{engine}_", dir=PREVIEW_DIR)
        try:
            emo = emotion if emotion != "normal" else None
            # measure_duration=False: sf.read 디코드를 건너뛰어 ffmpeg를 첫 디코더로 세운다.
            # 샘플은 타임스탬프가 필요 없으니 플레인 엔드포인트 사용(기존 정규화 경로 그대로).
            await generate_tts_typecast(
                tmp_dir, [SAMPLE_TEXT],
                voice_id=voice_id, speed=speed, emotion=emo,
                api_key=keys["typecast"], measure_duration=False, with_timestamps=False,
            )
            wav_path = os.path.join(tmp_dir, "sent_00.wav")
            if not os.path.exists(wav_path):
                raise HTTPException(500, "Typecast 오디오 생성 실패")

            # 브라우저 재생용 표준 WAV로 정규화 → 검증된 파일만 캐시에 들어간다.
            # ⚠️ 순서 중요: 정규화 성공 후 정규화 결과물에서 캐시로 이동(raw 바이트를 캐시하면 버그 재발).
            norm_path = os.path.join(tmp_dir, "sent_00_norm.wav")
            try:
                normalize_to_browser_wav(wav_path, norm_path)
                os.replace(norm_path, cached)
            except RuntimeError as norm_err:
                # 정규화(ffmpeg)가 실패 — 대표적으로 Windows Smart App Control 이 ffmpeg 실행을
                # 통째로 막는 경우(WinError 4551). 정규화는 "모든 브라우저 호환용" 마무리 단계일 뿐,
                # Typecast 원본 WAV 자체는 데스크톱(크로미움)에서 그대로 재생된다
                # (preview-build 가 원본을 그대로 서빙해 재생되는 것으로 이미 검증됨).
                # 따라서 원본이 재생 가능한 정상 WAV 면 그것으로 폴백 → ffmpeg 없이도 샘플이 들린다.
                if is_playable_wav(wav_path):
                    os.replace(wav_path, cached)
                elif is_app_control_block(norm_err):
                    # 원본조차 못 쓰는데 원인이 SAC 차단이면 원인·해결 문구를 노출(프론트 토스트).
                    raise HTTPException(502, SAC_MESSAGE_VOICE)
                else:
                    raise HTTPException(502, "샘플 오디오 생성에 실패했습니다. 잠시 후 다시 시도해주세요.")

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"미리듣기 생성 실패: {e}")
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

        if not os.path.exists(cached):
            raise HTTPException(500, "오디오 파일 생성 실패")

        return FileResponse(cached, media_type="audio/wav")


# ──────────────────────────────────────────────────────────────
# /api/tts/preview-build — 음성 설정 단계에서 실제 TTS 생성
# ──────────────────────────────────────────────────────────────
# 목적: "나레이션 음성 만들기" 버튼 클릭 시 호출돼 각 줄의 TTS를 미리 생성.
# 결과 파일은 storage/tts_sessions/{session_id}/ 에 sent_XX.wav 로 저장되며,
# 이후 Job 생성 시 job_dir/tts/ 로 이동돼 영상 조립에서 재사용된다(재생성 스킵).
# 커밋 5에서 promo_comment 한정 6초 초과 자동 분리가 이 엔드포인트에 통합될 예정.

def _voice_signature(req: TtsPreviewBuildRequest) -> list:
    """voice 변경 감지용 4-tuple — 직렬화 안전하게 list로 반환."""
    return [req.voice_id, float(req.speed), req.emotion or None, "typecast"]


def _load_signature(session_dir: str) -> dict | None:
    """signature.json 안전 로드. 손상/구버전이면 None 반환."""
    path = os.path.join(session_dir, "signature.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        # 최소 필드 검증 (구버전이면 None으로 떨어져 full rebuild)
        if not isinstance(data, dict):
            return None
        if not all(k in data for k in ("voice", "line_order", "line_hashes")):
            return None
        return data
    except Exception:
        return None


def _save_signature(session_dir: str, voice: list, line_order: list[str], line_hashes: dict[str, str]) -> None:
    payload = {
        "voice": voice,
        "line_order": list(line_order),
        "line_hashes": dict(line_hashes),
    }
    path = os.path.join(session_dir, "signature.json")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _measure_wav_duration_safe(path: str) -> float:
    # Python 3.13에서 stdlib audioop 제거 → pydub 기반 get_wav_duration이 import 단계에서 fail.
    # PCM wav는 stdlib wave로 정확히 측정 가능하므로 그걸 우선 시도.
    try:
        import wave
        with wave.open(path, "rb") as w:
            frames = w.getnframes()
            rate = w.getframerate()
            if rate:
                return frames / float(rate)
    except Exception:
        pass
    # 비-PCM wav 대비: pydub 시도 (Python 3.9 등 호환 환경)
    try:
        return float(get_wav_duration(path))
    except Exception:
        pass
    # 마지막 fallback: ffprobe
    try:
        import subprocess
        out = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10,
        )
        if out.returncode == 0 and out.stdout.strip():
            return float(out.stdout.strip())
    except Exception:
        pass
    return 0.0


async def _rebuild_full(session_dir: str, req: TtsPreviewBuildRequest, typecast_key: str, gemini_key: str | None):
    """기존 동작과 동일한 full rebuild — 모든 wav 새로 생성 + promo_comment 분리."""
    # 세션 정리 후 새 wav 생성
    if os.path.exists(session_dir):
        shutil.rmtree(session_dir)
    os.makedirs(session_dir, exist_ok=True)

    emotion = req.emotion if req.emotion and req.emotion != "normal" else None
    raw_timings = await generate_tts_typecast(
        session_dir,
        req.sentences,
        voice_id=req.voice_id,
        speed=req.speed,
        emotion=emotion,
        api_key=typecast_key,
    )
    durations = [t["duration"] for t in raw_timings]
    word_times = [t.get("word_times") for t in raw_timings]
    expanded_sentences = list(req.sentences)
    split_from_map: dict[int, int] = {}

    if req.content_type == "promo_comment":
        overlong = detect_overlong_lines(durations, LINE_DURATION_THRESHOLD)
        if overlong:
            try:
                expanded_sentences, durations, split_from_map, word_times = await _split_overlong_lines(
                    session_dir=session_dir,
                    sentences=req.sentences,
                    durations=durations,
                    word_times=word_times,
                    overlong_indices=overlong,
                    topic=req.topic or "",
                    style=req.style or "realistic",
                    gemini_api_key=gemini_key,
                )
            except Exception as e:
                import traceback
                print(f"[preview-build] 분리 실패 err={e}")
                traceback.print_exc()
                # 분리 실패해도 원본은 유지

    return expanded_sentences, durations, split_from_map, word_times


async def _rebuild_incremental(
    session_dir: str,
    req: TtsPreviewBuildRequest,
    typecast_key: str,
    prev_sig: dict,
) -> tuple[list[str], list[float], list[int], list]:
    """incremental rebuild — 변경된 줄만 Typecast 재호출.

    전제:
    - req.line_ids는 req.sentences와 1:1 길이
    - prev_sig의 voice와 현재 voice가 일치
    - prev_sig.line_order / line_hashes 형식이 유효

    동작:
    - 기존 sent_*.wav 를 _swap/{line_id}.wav 로 rename
    - 새 line_order 따라가며: text_hash 동일하면 _swap에서 새 인덱스로 rename, 다르면 regen 인덱스 수집
    - generate_tts_for_indices로 변경 인덱스만 합성
    - 모든 줄의 duration을 wav에서 재측정 (재사용된 wav 포함)
    - word_times: 재생성 줄은 새 값, 재사용 줄은 line_id 로 기존 값 이월(wav는 rename만 되므로 유효)

    반환: (sentences, durations, indices_to_regen, word_times)
    """
    n = len(req.sentences)
    line_ids = list(req.line_ids or [])
    if len(line_ids) != n:
        raise HTTPException(400, "line_ids와 sentences의 길이가 다릅니다")
    new_hashes = {lid: line_text_hash(req.sentences[i]) for i, lid in enumerate(line_ids)}

    prev_order: list[str] = list(prev_sig.get("line_order") or [])
    prev_hashes: dict[str, str] = dict(prev_sig.get("line_hashes") or {})

    # word_times 이월용: timings_raw.json 이 덮이기 전에 line_id 별로 미리 읽어둔다.
    prev_word_times_by_lid: dict[str, list | None] = {}
    try:
        with open(os.path.join(session_dir, "timings_raw.json"), encoding="utf-8") as f:
            prev_timings = json.load(f)
    except Exception:
        prev_timings = []
    for old_idx, lid in enumerate(prev_order):
        if lid and old_idx < len(prev_timings) and isinstance(prev_timings[old_idx], dict):
            prev_word_times_by_lid[lid] = prev_timings[old_idx].get("word_times")

    # 기존 wav를 _swap/{line_id}.wav 로 옮김
    swap_dir = os.path.join(session_dir, "_swap")
    if os.path.exists(swap_dir):
        shutil.rmtree(swap_dir)
    os.makedirs(swap_dir, exist_ok=True)
    for old_idx, lid in enumerate(prev_order):
        src = os.path.join(session_dir, f"sent_{old_idx:02d}.wav")
        if os.path.exists(src) and lid:
            try:
                os.rename(src, os.path.join(swap_dir, f"{lid}.wav"))
            except Exception:
                pass

    # 잔존 sent_*.wav (signature에 없는 인덱스) 제거
    for name in os.listdir(session_dir):
        if name.startswith("sent_") and name.endswith(".wav"):
            try:
                os.remove(os.path.join(session_dir, name))
            except Exception:
                pass

    # 새 line_order에 맞춰 _swap에서 복원 또는 재생성 대상에 추가
    indices_to_regen: list[int] = []
    for new_idx, lid in enumerate(line_ids):
        dest = os.path.join(session_dir, f"sent_{new_idx:02d}.wav")
        swap_path = os.path.join(swap_dir, f"{lid}.wav") if lid else ""
        if (
            lid
            and prev_hashes.get(lid) == new_hashes[lid]
            and swap_path
            and os.path.exists(swap_path)
        ):
            try:
                os.rename(swap_path, dest)
                continue
            except Exception:
                # 복원 실패 → 재생성으로 폴백
                pass
        indices_to_regen.append(new_idx)

    # _swap에 남은 wav는 삭제된 줄 → 정리
    shutil.rmtree(swap_dir, ignore_errors=True)

    # 변경 줄만 Typecast 호출 (word_times 포함해서 받음)
    regen_results: dict[int, dict] = {}
    if indices_to_regen:
        emotion = req.emotion if req.emotion and req.emotion != "normal" else None
        regen_results = await generate_tts_for_indices(
            session_dir,
            req.sentences,
            indices_to_regen,
            voice_id=req.voice_id,
            speed=req.speed,
            emotion=emotion,
            api_key=typecast_key,
        )

    # 모든 줄 duration 측정 (재사용 줄도 wav 기반으로 재측정 — 단일 진실원)
    durations: list[float] = []
    for i in range(n):
        wav_path = os.path.join(session_dir, f"sent_{i:02d}.wav")
        durations.append(round(_measure_wav_duration_safe(wav_path), 2))

    # word_times: 재생성 줄은 방금 받은 값, 재사용 줄은 line_id 로 이월(없으면 None → 비례 폴백).
    regen_set = set(indices_to_regen)
    word_times = [
        ((regen_results.get(i) or {}).get("word_times") if i in regen_set
         else prev_word_times_by_lid.get(lid))
        for i, lid in enumerate(line_ids)
    ]

    return list(req.sentences), durations, indices_to_regen, word_times


@router.post("/preview-build")
async def preview_build(
    req: TtsPreviewBuildRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    if not req.sentences:
        raise HTTPException(400, "sentences가 비어있습니다")

    keys = resolve_user_api_keys(db, _user.id)
    if not keys["typecast"]:
        raise HTTPException(400, "Typecast API 키가 설정되지 않았습니다. 설정 페이지에서 사용자 본인의 키를 입력하세요.")

    # 세션 id 결정: 재빌드면 기존 id 재사용, 아니면 새로 생성
    existing_id = req.existing_session_id
    if existing_id and re.match(r"^[a-f0-9]{12}$", existing_id):
        session_id = existing_id
    else:
        session_id = uuid.uuid4().hex[:12]
    session_dir = os.path.join(TTS_SESSIONS_DIR, session_id)

    new_voice = _voice_signature(req)
    line_ids_provided = bool(req.line_ids) and len(req.line_ids or []) == len(req.sentences)

    lock = _get_session_lock(session_id)
    async with lock:
        prev_sig = _load_signature(session_dir) if os.path.isdir(session_dir) else None

        incremental = (
            line_ids_provided
            and prev_sig is not None
            and list(prev_sig.get("voice") or []) == new_voice
            and os.path.isdir(session_dir)
        )

        try:
            if incremental:
                expanded_sentences, durations, regen_indices, word_times = await _rebuild_incremental(
                    session_dir, req, keys["typecast"], prev_sig
                )
                split_from_map: dict[int, int] = {}
            else:
                expanded_sentences, durations, split_from_map, word_times = await _rebuild_full(
                    session_dir, req, keys["typecast"], keys["gemini"]
                )
                regen_indices = list(range(len(expanded_sentences)))
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            print(f"[preview-build] TTS 생성 실패 session={session_id} err={e}")
            traceback.print_exc()
            if not incremental and os.path.exists(session_dir):
                shutil.rmtree(session_dir, ignore_errors=True)
            raise HTTPException(500, f"TTS 생성 실패: {e}")

        # timings_raw.json 갱신 (word_times 포함 — 렌더·매니페스트가 어절 타이밍을 읽는다)
        raw_timings_out = [
            {"text": s, "duration": d, "word_times": wt}
            for s, d, wt in zip(expanded_sentences, durations, word_times)
        ]
        with open(os.path.join(session_dir, "timings_raw.json"), "w", encoding="utf-8") as f:
            json.dump(raw_timings_out, f, ensure_ascii=False, indent=2)

        # metadata.json (기존 형식 유지 — 호환성)
        metadata = {
            "voice_id": req.voice_id,
            "speed": req.speed,
            "emotion": req.emotion,
            "original_sentences": list(req.sentences),
            "expanded_sentences": expanded_sentences,
            "durations": durations,
            "word_times": word_times,
            "split_from_map": split_from_map,
            "content_type": req.content_type,
            # 세션 오디오 서빙 시 소유권 확인용. (구세션엔 없음 → 하위호환으로 통과)
            "user_id": _user.id,
        }
        with open(os.path.join(session_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

        # signature.json — line_ids 제공된 경우에만 (incremental 가능 조건)
        if line_ids_provided and not split_from_map:
            # promo_comment 분리가 일어났다면 sentence 수가 바뀌므로 line_id 매핑 불가 → signature 저장 보류.
            # (분리는 카드 A 전용 흐름이라 카드 B incremental 시나리오와 충돌하지 않음.)
            line_order = list(req.line_ids or [])
            line_hashes = {
                lid: line_text_hash(req.sentences[i])
                for i, lid in enumerate(line_order)
            }
            _save_signature(session_dir, new_voice, line_order, line_hashes)

    return {
        "session_id": session_id,
        "lines_count": len(expanded_sentences),
        "durations": durations,
        "word_times": word_times,
        "split_count": len(split_from_map),
        "expanded_sentences": expanded_sentences,
        "regenerated_indices": regen_indices,
        "incremental": incremental,
    }


# ──────────────────────────────────────────────────────────────
# 세션 오디오 서빙 — 화면·소리 단계의 줄별/전체 미리듣기용
# ──────────────────────────────────────────────────────────────
# 줄별 재생: <audio src> 가 쿠키 인증으로 이 GET 을 직접 부른다(프록시 경유, BGM 서빙과 동일 패턴).
# 재열기(reopen) 후에도 _restore_tts_session_dir 이 세션 폴더를 복원하므로 재빌드 없이 즉시 재생 가능.

def _load_session_metadata(session_dir: str) -> dict | None:
    path = os.path.join(session_dir, "metadata.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _check_session_owner(metadata: dict, user: User) -> None:
    """세션 소유권 확인. user_id 태그 없는 구세션은 통과(하위호환), 있으면 본인/admin 만."""
    owner = (metadata or {}).get("user_id")
    if owner and owner != user.id and user.role != "admin":
        raise HTTPException(404, "세션을 찾을 수 없습니다")


@router.get("/preview-session/{session_id}")
async def get_preview_session(
    session_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """세션 매니페스트 — 재열기 시 프론트가 재빌드 없이 스냅샷을 복원하는 데 쓴다."""
    session_dir = os.path.join(TTS_SESSIONS_DIR, session_id)
    metadata = _load_session_metadata(session_dir)
    if not os.path.isdir(session_dir) or metadata is None:
        raise HTTPException(404, "세션을 찾을 수 없습니다")
    _check_session_owner(metadata, _user)
    sig = _load_signature(session_dir)
    durations = metadata.get("durations") or []
    return {
        "session_id": session_id,
        "line_ids": (sig.get("line_order") if sig else None),
        "line_hashes": (sig.get("line_hashes") if sig else None),
        "durations": durations,
        "word_times": metadata.get("word_times"),
        "voice": {
            "voice_id": metadata.get("voice_id"),
            "speed": metadata.get("speed"),
            "emotion": metadata.get("emotion"),
        },
        "lines_count": len(durations),
    }


@router.get("/preview-session/{session_id}/line/{index}")
async def get_preview_session_line(
    session_id: str = Path(..., pattern=r"^[a-f0-9]{12}$"),
    index: int = Path(..., ge=0, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(get_approved_user),
):
    """세션의 한 줄 오디오(sent_XX.wav)를 반환. <audio> Range 요청은 FileResponse 가 처리."""
    session_dir = os.path.join(TTS_SESSIONS_DIR, session_id)
    metadata = _load_session_metadata(session_dir)
    if not os.path.isdir(session_dir) or metadata is None:
        raise HTTPException(404, "세션을 찾을 수 없습니다")
    _check_session_owner(metadata, _user)
    wav = os.path.join(session_dir, f"sent_{index:02d}.wav")
    if not os.path.exists(wav):
        raise HTTPException(404, "해당 줄 오디오가 없습니다")
    return FileResponse(wav, media_type="audio/wav")


async def _split_overlong_lines(
    session_dir: str,
    sentences: list[str],
    durations: list[float],
    word_times: list,
    overlong_indices: list[int],
    topic: str,
    style: str,
    gemini_api_key: str | None,
) -> tuple[list[str], list[float], dict[int, int], list]:
    """6초 초과 줄을 Gemini(1순위) 또는 구두점(폴백)으로 2분할하고
    세션 디렉토리의 sent_XX.wav 파일들을 재배치.

    분할된 줄은 wav 를 잘라내므로 원래 word_times 가 무효 → 두 조각 모두 None.
    반환: (확장된 sentences, 확장된 durations, {새 인덱스: 원본 인덱스} 매핑, 확장된 word_times)
    """
    # 1) 각 초과 줄의 분리 텍스트 계산
    split_texts: dict[int, list[str]] = {}
    for idx in overlong_indices:
        parts = await split_long_line_with_gemini(
            sentences[idx], topic, style, api_key=gemini_api_key
        )
        if parts is None:
            parts = split_by_punctuation(sentences[idx])
        split_texts[idx] = parts

    # 2) 임시 디렉토리에 재번호 매긴 wav 생성 후 세션 디렉토리로 이동
    temp_dir = os.path.join(session_dir, "_split_temp")
    os.makedirs(temp_dir, exist_ok=True)

    expanded_sentences: list[str] = []
    expanded_durations: list[float] = []
    expanded_word_times: list = []
    split_from_map: dict[int, int] = {}

    new_idx = 0
    for orig_idx, sent in enumerate(sentences):
        src_wav = os.path.join(session_dir, f"sent_{orig_idx:02d}.wav")
        if orig_idx in split_texts:
            parts = split_texts[orig_idx]
            # 분할 시각 계산 (음절 비율 + 침묵 감지 보정)
            cut_sec = await asyncio.to_thread(
                calculate_split_point, src_wav, parts[0], parts[1]
            )
            out_a = os.path.join(temp_dir, f"sent_{new_idx:02d}.wav")
            out_b = os.path.join(temp_dir, f"sent_{new_idx + 1:02d}.wav")
            await asyncio.to_thread(cut_wav_at, src_wav, cut_sec, out_a, out_b)
            dur_a = await asyncio.to_thread(get_wav_duration, out_a)
            dur_b = await asyncio.to_thread(get_wav_duration, out_b)

            expanded_sentences.extend(parts)
            expanded_durations.extend([round(dur_a, 2), round(dur_b, 2)])
            expanded_word_times.extend([None, None])  # wav 를 잘라 원래 타임스탬프 무효
            split_from_map[new_idx] = orig_idx
            split_from_map[new_idx + 1] = orig_idx
            new_idx += 2
        else:
            out = os.path.join(temp_dir, f"sent_{new_idx:02d}.wav")
            shutil.copy(src_wav, out)
            expanded_sentences.append(sent)
            expanded_durations.append(durations[orig_idx])
            expanded_word_times.append(word_times[orig_idx] if orig_idx < len(word_times) else None)
            new_idx += 1

    # 3) 원본 sent_XX.wav 삭제 후 temp 파일들을 세션 디렉토리로 이동
    for orig_idx in range(len(sentences)):
        orig = os.path.join(session_dir, f"sent_{orig_idx:02d}.wav")
        if os.path.exists(orig):
            os.remove(orig)
    for i in range(new_idx):
        src = os.path.join(temp_dir, f"sent_{i:02d}.wav")
        dst = os.path.join(session_dir, f"sent_{i:02d}.wav")
        shutil.move(src, dst)
    shutil.rmtree(temp_dir, ignore_errors=True)

    return expanded_sentences, expanded_durations, split_from_map, expanded_word_times
