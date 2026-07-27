"""TTS 엔진 통합 (Typecast · ElevenLabs)"""

import asyncio
import json
import os
import time
from functools import partial


# Typecast 합성 모델 — 전 성우 v30 통일.
#
# 예전엔 류은·창수·세진 3명만 구형 ssfm-v21 로 고정했었다(V21_ONLY_VOICES). 문제는
# 감정 목록(routes/tts_preview.py get_voice_emotions)은 v30 기준으로 뽑아 보여준다는 것.
# v21 은 감정이 normal/happy/sad/angry 4종뿐이라, 화면엔 '밝게'(toneup) 가 떠 있는데
# 정작 생성은 v21 로 나가 422 EMOTION_NOT_SUPPORTED 로 죽었다(메뉴판과 주방이 다른 버전).
# 2026-07 실제 API 로 확인한 결과 그 3명도 v30 + toneup 이 정상 생성돼(200) 고정을 제거했다.
# 나머지 6명은 원래부터 v30 이라 영향 없음. 다시 특정 성우를 v21 로 되돌린다면 감정 목록
# 쪽도 같은 기준으로 맞춰야 한다 — 안 그러면 같은 버그가 재발한다.
_TYPECAST_MODEL = "ssfm-v30"

# 동시 요청 개수. 디버깅 중: 1로 낮춰 순차 처리 (병렬 처리 때 sent_XX.wav
# 파일이 간헐적으로 손상되는 현상 격리). 원인 확정 후 다시 2~3으로 복원.
#
# 2026-07 진척: 손상의 유력한 용의자 하나가 제거됐다. 예전엔 문장 하나가 실패해도
# asyncio.gather 가 형제 작업을 취소하지 않아, 빌드 실패 후 사용자가 바로 재시도하면
# 이전 빌드의 '유령 작업'이 같은 세션 폴더에 같은 sent_XX.wav 를 계속 쓰면서 새 작업과
# 충돌할 수 있었다. 지금은 _run_sentence_jobs 의 중단 깃발이 남은 문장을 즉시 멈춘다.
# 다만 이게 손상의 원인이었다는 확증은 아직 없어(정황 수준) 1 을 유지한다.
# 되돌릴 때: 2 로 올려 실사용에서 손상이 재발하지 않는지 먼저 확인할 것(음성 생성 2배 단축).
_TYPECAST_MAX_CONCURRENCY = 1

# ElevenLabs — Typecast 의 1(손상 회피)과 무관한 별도 엔진이라 소폭 병렬 허용.
_ELEVEN_BASE = "https://api.elevenlabs.io"
_ELEVEN_MAX_CONCURRENCY = 2
_ELEVEN_DEFAULT_MODEL = "eleven_multilingual_v2"
# ElevenLabs voice_settings.speed 허용 범위(문서 기준 보수적으로 클램프).
_ELEVEN_SPEED_MIN = 0.7
_ELEVEN_SPEED_MAX = 1.2

# 앞뒤 문맥(previous_text/next_text) 으로 붙일 최대 글자 수(각 방향).
#
# 대본은 줄마다 따로 API 를 호출하는데, "먼저 첫째, 토리예요." 같은 짧은 줄이 홀로 날아가면
# 모델이 언어를 추측할 단서가 부족해 한국어 대본인데 중국어·영어 발음이 튀어나온다
# (ElevenLabs 공식 문서도 인정하는 알려진 현상이고, multilingual v2 는 language_code 로
# 언어를 잠글 수도 없다). 앞뒤 문장을 문맥으로 같이 보내면 "이건 한국어 문단"이라는 단서가
# 생겨 오추측이 줄고 줄 사이 억양 연결도 자연스러워진다.
#
# 문맥은 읽히지 않고 참고만 되므로 과금되지 않는다 — 2026-07 실측: 610자 문맥 + 12자 문장
# 호출에서 사용량은 7 만 증가(문맥이 과금됐다면 ~620 증가했어야 함).
_ELEVEN_CONTEXT_CHARS = 300

# 앞뒤 문맥을 받지 않는 모델. v3 에 previous_text/next_text 를 보내면 HTTP 400
# (validation_error / unsupported_model) 로 생성 자체가 실패한다 — 반드시 걸러야 한다.
_ELEVEN_NO_CONTEXT_MODELS = {"eleven_v3"}


def _eleven_context(sentences, index, model_id):
    """index 줄 기준 (previous_text, next_text). 지원 안 하는 모델이면 (None, None).

    앞/뒤로 _ELEVEN_CONTEXT_CHARS 글자를 넘지 않는 선까지 이웃 문장을 이어 붙인다.
    """
    if (model_id or _ELEVEN_DEFAULT_MODEL) in _ELEVEN_NO_CONTEXT_MODELS:
        return None, None
    if not sentences or not (0 <= index < len(sentences)):
        return None, None

    def _gather(rng):
        parts = []
        total = 0
        for i in rng:
            s = str(sentences[i] or "").strip()
            if not s:
                continue
            if total + len(s) > _ELEVEN_CONTEXT_CHARS and parts:
                break
            parts.append(s)
            total += len(s)
        return parts

    prev_parts = _gather(range(index - 1, -1, -1))  # 가까운 줄부터 모아서
    prev = " ".join(reversed(prev_parts)) or None   # 원래 순서로 되돌림
    nxt = " ".join(_gather(range(index + 1, len(sentences)))) or None
    return prev, nxt


# ⚠️ v3 는 요청 사이 톤을 이어주는 장치가 하나도 없다(2026-07 실 API 검증).
#   · seed: 200 으로 받아주지만 무시된다 — 같은 seed·같은 문장 2회가 서로 다른 오디오.
#     (v2 는 같은 seed 면 바이트까지 동일 → v2 만 실제 적용됨)
#   · previous_text/next_text: HTTP 400 unsupported_model 로 아예 거부.
#   · request stitching(previous_request_ids): 공식 문서상 v3 미지원. dialogue 에도 없음.
# 그래서 줄마다 따로 호출하면 v3 톤 흔들림을 줄일 방법이 없었다(안정성을 '안정적'으로 올려도
# 줄별 음높이 편차 148Hz 로, v2 중간 설정 70Hz 의 2 배). 위 3 개를 다시 시도하지 말 것 —
# 해결은 아래 text-to-dialogue 경로다.


# ── ElevenLabs text-to-dialogue (v3 전용) ──────────────────────────────
#
# 대본을 한 요청에 통째로 넣으면 한 번의 연기로 전부 만들어져 줄별 편차가 76Hz 로 절반이
# 된다(2026-07 실측, v2 의 70Hz 와 같은 수준). 이게 v3 톤 흔들림의 유일한 해법이다.
#
# /with-timestamps 로 부르면 voice_segments 에 줄별 시작·끝 시간과 글자 인덱스가 함께 와서,
# 한 덩어리 오디오를 줄별 sent_XX.wav 로 정확히 자를 수 있다. 자막용 글자 정렬도 그대로
# 나오므로 기존 파이프라인(_alignment_to_word_times)을 그대로 재사용한다.
#
# 한 줄만 다시 뽑아도 된다 — 재생성으로 생기는 톤 차이는 평균 28Hz 로, 한 대본 안에서
# 이웃 줄끼리 원래 나는 차이(평균 30Hz)보다 작다. 앞뒤 줄을 창처럼 같이 보내도 26Hz 로
# 차이가 없다(이웃도 새로 만들어지므로 '간직한 옛 오디오'와 맞을 이유가 없다). 그러니
# 증분 재생성에 창을 끼워 넣어 크레딧을 더 쓰지 말 것.
_ELEVEN_DIALOGUE_MODELS = {"eleven_v3"}

# 한 요청에 넣을 최대 글자 수. 공식 문서가 2000자 이하를 권하며, 넘기면 스트리밍이 도중에
# 끊기거나 validation_error 가 날 수 있다고 명시한다. 실사용 쇼츠 대본은 최대 668자라 보통
# 한 번에 들어가지만, 대본 상한(5000자)까지 쓰면 배치가 나뉜다. 배치 경계에선 톤이 살짝
# 튈 수 있는데(재롤 편차 ~21Hz) 줄 사이 자연 편차(~30Hz)보다 작아 체감되지 않는다.
_ELEVEN_DIALOGUE_MAX_CHARS = 2000


def _uses_dialogue(model_id) -> bool:
    return (model_id or _ELEVEN_DEFAULT_MODEL) in _ELEVEN_DIALOGUE_MODELS


def _dialogue_batches(indices, sentences, max_chars=_ELEVEN_DIALOGUE_MAX_CHARS):
    """indices 를 글자 수 상한에 맞춰 배치로 나눈다.

    한 줄이 혼자 상한을 넘어도 쪼개지 않고 단독 배치로 둔다 — 문장을 임의로 자르면
    자막 줄과 음성 줄이 어긋나기 때문. (그 경우 API 가 거부하면 그대로 에러가 뜬다.)
    """
    batches: list[list[int]] = []
    cur: list[int] = []
    total = 0
    for i in indices:
        n = len(str(sentences[i] or ""))
        if cur and total + n > max_chars:
            batches.append(cur)
            cur, total = [], 0
        cur.append(i)
        total += n
    if cur:
        batches.append(cur)
    return batches


def _slice_alignment(alignment, char_start, char_end, offset_seconds, tempo):
    """전체 글자 정렬에서 [char_start, char_end) 구간만 잘라 그 줄 기준으로 옮긴다.

    tempo 는 응답을 받은 뒤 우리가 ffmpeg 로 걸 배속이다. 배속을 걸면 오디오가
    1/tempo 로 짧아지므로 타임스탬프도 같은 비율로 줄여야 자막이 어긋나지 않는다.
    offset_seconds 는 이미 배속이 반영된 그 줄의 시작 시각.
    """
    if not isinstance(alignment, dict):
        return None
    chars = alignment.get("characters")
    starts = alignment.get("character_start_times_seconds")
    ends = alignment.get("character_end_times_seconds")
    if not (isinstance(chars, list) and isinstance(starts, list) and isinstance(ends, list)):
        return None
    n = min(len(chars), len(starts), len(ends))
    cs = max(0, min(int(char_start), n))
    ce = max(cs, min(int(char_end), n))
    if ce <= cs:
        return None
    try:
        return {
            "characters": [str(c) for c in chars[cs:ce]],
            "character_start_times_seconds": [
                max(0.0, float(s) / tempo - offset_seconds) for s in starts[cs:ce]
            ],
            "character_end_times_seconds": [
                max(0.0, float(e) / tempo - offset_seconds) for e in ends[cs:ce]
            ],
        }
    except (TypeError, ValueError):
        return None


def _dialogue_spans(segments, count, prefix):
    """voice_segments → {입력번호: [시작초, 끝초, 글자시작, 글자끝]}.

    한 입력이 여러 조각으로 쪼개져 올 가능성에 대비해 같은 번호끼리 합친다.
    """
    spans: dict[int, list] = {}
    for seg in segments or []:
        try:
            k = int(seg["dialogue_input_index"])
            t0 = float(seg["start_time_seconds"])
            t1 = float(seg["end_time_seconds"])
            cs = int(seg["character_start_index"])
            ce = int(seg["character_end_index"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (0 <= k < count):
            continue
        cur = spans.get(k)
        if cur is None:
            spans[k] = [t0, t1, cs, ce]
        else:
            cur[0], cur[1] = min(cur[0], t0), max(cur[1], t1)
            cur[2], cur[3] = min(cur[2], cs), max(cur[3], ce)
    missing = [k for k in range(count) if k not in spans]
    if missing:
        raise RuntimeError(
            f"{prefix} 응답에서 {len(missing)}개 줄의 구간 정보를 찾지 못했습니다. 다시 시도해주세요."
        )
    return spans


# ── Typecast 크레딧 소진(402) 안내 ──
#
# Typecast 는 이번 달 크레딧을 다 쓰면 402 + {"error_code":"CREDIT_INSUFFICIENT"} 를 보낸다.
# 원문이 영문 JSON 이라 그대로 노출하면 사용자는 원인도 해결책도 알 수 없다(실제로 그 화면을
# 받고 "TTS 가 갑자기 안 된다" 는 문의가 들어왔다). 재시도·엔드포인트 폴백으로 풀리는 문제가
# 아니므로 만나는 즉시 이 문구로 바꿔 던진다.
#
# ⚠️ TYPECAST_CREDIT_MARKER 는 프론트(TtsConfig / LineAssetEditor)가 이 실패를 알아보고
# '사용량 확인' 버튼을 붙이는 표식이다. 문구를 바꾸면 프론트 감지도 함께 고칠 것.
TYPECAST_USAGE_URL = "https://studio.typecast.ai/developers/api"
TYPECAST_CREDIT_MARKER = "타입캐스트 월 크레딧"
TYPECAST_CREDIT_MESSAGE = (
    f"{TYPECAST_CREDIT_MARKER}을 모두 사용하셨습니다. "
    "크레딧은 매달 결제일에 자동으로 다시 채워져요. "
    "기다리지 않고 바로 더 만들려면 타입캐스트 요금제를 업그레이드해 주세요. "
    f"사용량 확인: {TYPECAST_USAGE_URL}"
)


class TypecastCreditExhausted(RuntimeError):
    """Typecast 월 크레딧 소진(402). 재시도해도 풀리지 않으니 즉시 중단 대상."""

    def __init__(self):
        super().__init__(TYPECAST_CREDIT_MESSAGE)


def _raise_if_credit_exhausted(resp):
    """402(또는 CREDIT_INSUFFICIENT 응답)면 한국어 안내로 즉시 중단시킨다.

    계정 비활성도 같은 402 로 오지만, 어느 쪽이든 사용자가 대시보드에서 확인해야 하는 건
    같아서 문구를 나누지 않는다.
    """
    if resp.status_code < 400:
        return
    if resp.status_code == 402 or "CREDIT_INSUFFICIENT" in (resp.text or ""):
        raise TypecastCreditExhausted()


async def _run_sentence_jobs(concurrency, jobs):
    """문장별 합성 작업을 동시 실행하되, 하나가 실패하면 남은 문장은 API 를 부르지 않고 포기한다.

    jobs 는 인자 없는 동기 함수 목록(각각 asyncio.to_thread 로 실행). 반환은 jobs 순서
    그대로의 결과 목록이고, 하나라도 실패하면 그 예외를 타입 그대로 올린다.

    ⚠️ 이 '중단 깃발'이 없으면(예전 코드: 그냥 asyncio.gather) 20줄 대본의 11번째에서
    크레딧 소진(402) 이 나도 12~20번 줄은 세마포어 큐에 그대로 남아 각자 API 를 한 번씩
    더 두들기고 실패한다. asyncio.gather 는 자식 하나가 예외를 던지면 그 예외만 호출자에게
    전파할 뿐 형제 작업을 취소하지 않기 때문이다.

    asyncio.TaskGroup 은 형제를 자동 취소해주지만 예외를 ExceptionGroup 으로 감싸 던져서
    routes/tts_preview.py 의 `except TypecastCreditExhausted` 핸들러가 못 알아본다.
    게다가 asyncio.to_thread 로 넘어간 작업은 이미 스레드에서 돌고 있어 취소 자체가 안 먹는다.
    그래서 스레드로 넘기기 '직전'에 깃발을 확인하는 이 방식이 현재 구조에 맞는다.
    (실행 중이던 문장 하나는 끝까지 가지만, 아직 대기 중인 나머지는 전부 즉시 멈춘다.)
    """
    sem = asyncio.Semaphore(concurrency)
    failure = None

    async def _run(job):
        nonlocal failure
        async with sem:
            if failure is not None:
                # 이미 실패가 확정됐다 — 헛호출 없이 같은 실패로 끝낸다.
                raise failure
            try:
                return await asyncio.to_thread(job)
            except Exception as e:  # CancelledError(BaseException)는 깃발 대상이 아니다
                if failure is None:
                    failure = e
                raise

    return await asyncio.gather(*[_run(j) for j in jobs])


def _coerce_float(v, default):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _drop_unsupported_emotion(payload, resp, prefix):
    """성우가 지원하지 않는 감정이면(422) payload 에서 감정만 떼어낸다. 뗐으면 True(=재시도).

    감정 목록은 성우별로 API 에서 받아오지만, 예전에 저장해 둔 프로젝트에는 지금은
    못 쓰는 감정이 남아 있을 수 있다. 그럴 때 영상 전체를 실패시키는 대신 기본 톤으로라도
    나오게 하는 안전망. 감정 외의 4xx(키·크레딧 등)는 건드리지 않고 그대로 에러로 보낸다.
    """
    if resp.status_code < 400 or "prompt" not in payload:
        return False
    if "EMOTION_NOT_SUPPORTED" not in (resp.text or ""):
        return False
    dropped = (payload.pop("prompt", None) or {}).get("emotion_preset", "?")
    print(f"{prefix} 이 성우가 '{dropped}' 감정을 지원하지 않아 기본 톤으로 생성합니다")
    return True


def _request_plain(out_path, prefix, headers, payload):
    """플레인 /v1/text-to-speech — 오디오 바이트만 받아 out_path 에 쓴다(타임스탬프 없음).

    실패 지점(HTTP 에러·polling 타임아웃)마다 RuntimeError. with-timestamps 실패 시 폴백 대상.
    """
    import requests

    def _post():
        return requests.post(
            "https://api.typecast.ai/v1/text-to-speech",
            headers=headers,
            json=payload,
            timeout=60,
        )

    resp = _post()
    if _drop_unsupported_emotion(payload, resp, prefix):
        resp = _post()
    _raise_if_credit_exhausted(resp)
    if resp.status_code == 429:
        raise RuntimeError(f"{prefix} Typecast rate limit (429)")
    if resp.status_code >= 400:
        raise RuntimeError(f"{prefix} HTTP {resp.status_code}: {resp.text[:200]}")

    content_type = resp.headers.get("Content-Type", "")
    if "audio" in content_type or "octet-stream" in content_type:
        with open(out_path, "wb") as f:
            f.write(resp.content)
        return
    try:
        result = resp.json()
    except Exception as e:
        raise RuntimeError(f"{prefix} 응답 JSON 파싱 실패: {e} / body={resp.text[:200]}")
    speak_url = result.get("result", {}).get("speak_v2_url")
    if not speak_url:
        raise RuntimeError(f"{prefix} speak_v2_url 없음 / response={json.dumps(result)[:300]}")

    done = False
    last_status = None
    for _ in range(30):
        time.sleep(2)
        poll = requests.get(speak_url, headers=headers, timeout=30)
        if poll.status_code != 200:
            last_status = f"polling HTTP {poll.status_code}"
            continue
        data = poll.json()
        status = data.get("result", {}).get("status")
        last_status = status
        if status == "done":
            audio_url = data["result"].get("audio_download_url") or data["result"].get("audio_url")
            if not audio_url:
                raise RuntimeError(f"{prefix} status=done인데 audio_url 없음")
            audio_resp = requests.get(audio_url, timeout=60)
            if audio_resp.status_code != 200:
                raise RuntimeError(f"{prefix} audio 다운로드 HTTP {audio_resp.status_code}")
            with open(out_path, "wb") as f:
                f.write(audio_resp.content)
            done = True
            break
        if status in ("failed", "error"):
            raise RuntimeError(f"{prefix} Typecast polling status={status} / data={json.dumps(data)[:300]}")
    if not done:
        raise RuntimeError(f"{prefix} 60초 polling 타임아웃 (마지막 상태: {last_status})")


def _normalize_words(words):
    """API words 배열 → [{"text","start","end"}] 정규화. 형식 이상이면 None."""
    if not isinstance(words, list) or not words:
        return None
    out = []
    try:
        for w in words:
            out.append({
                "text": str(w["text"]),
                "start": round(float(w["start"]), 3),
                "end": round(float(w["end"]), 3),
            })
    except (KeyError, TypeError, ValueError):
        return None
    return out or None


def _validate_word_times(word_times, duration):
    """단조증가 start 확인. 마지막 end 가 오디오 길이보다 크게 벗어나면(템포 미반영 의심)
    실제 길이에 맞춰 선형 스케일. 그래도 이상하면 None(호출부가 비례 폴백)."""
    if not word_times or not duration or duration <= 0:
        return None
    starts = [w["start"] for w in word_times]
    if any(starts[i] > starts[i + 1] + 1e-6 for i in range(len(starts) - 1)):
        return None
    last_end = word_times[-1]["end"]
    if last_end > duration + 0.3:
        if last_end <= 0:
            return None
        scale = duration / last_end
        word_times = [
            {"text": w["text"], "start": round(w["start"] * scale, 3), "end": round(w["end"] * scale, 3)}
            for w in word_times
        ]
    return word_times


def _generate_one_sentence_typecast(
    tts_dir, index, sent, headers, vid, model, speed, emotion,
    measure_duration=True, with_timestamps=True,
):
    """한 문장만 Typecast로 합성하고 sent_XX.wav 저장. {text, duration, word_times} 반환.

    with_timestamps=True면 /v1/text-to-speech/with-timestamps 로 어절별 (start,end) 를 함께
    받아 word_times 로 돌려준다. 4xx/5xx·응답 이상 시 플레인 엔드포인트로 폴백(word_times=None).
    429는 폴백 없이 그대로 에러(플레인도 429일 것).

    measure_duration=False면 sf.read 디코드를 건너뛰고 duration 0.0(미리듣기 전용,
    with_timestamps=False 로 호출됨).
    """
    import requests

    prefix = f"[Typecast sent_{index:02d}]"
    payload = {
        "text": sent,
        "voice_id": vid,
        "model": model,
        "output": {"format": "wav", "sample_rate": 44100, "audio_tempo": speed or 1.0},
    }
    if emotion and emotion != "normal":
        payload["prompt"] = {"emotion_type": "preset", "emotion_preset": emotion}
    out_path = os.path.join(tts_dir, f"sent_{index:02d}.wav")

    word_times = None
    used_timestamps = False
    if with_timestamps:
        import base64

        def _post_ts():
            return requests.post(
                "https://api.typecast.ai/v1/text-to-speech/with-timestamps",
                headers=headers,
                json=payload,
                params={"granularity": "word"},
                timeout=60,
            )

        resp = _post_ts()
        if _drop_unsupported_emotion(payload, resp, prefix):
            resp = _post_ts()
        # 크레딧 소진은 플레인 엔드포인트도 똑같이 거절한다 → 폴백 없이 즉시 중단(헛호출 방지).
        _raise_if_credit_exhausted(resp)
        if resp.status_code == 429:
            raise RuntimeError(f"{prefix} Typecast rate limit (429)")
        if resp.status_code >= 400:
            print(f"{prefix} with-timestamps HTTP {resp.status_code} → 플레인 엔드포인트로 폴백")
        else:
            try:
                data = resp.json()
                audio_b64 = data.get("audio")
                fmt = data.get("audio_format")
                if audio_b64 and (not fmt or fmt == "wav"):
                    with open(out_path, "wb") as f:
                        f.write(base64.b64decode(audio_b64))
                    used_timestamps = True
                    word_times = _normalize_words(data.get("words"))
                else:
                    print(f"{prefix} with-timestamps 응답 이상(audio/format) → 플레인 폴백")
            except Exception as e:
                print(f"{prefix} with-timestamps 파싱 실패({e}) → 플레인 폴백")

    if not used_timestamps:
        _request_plain(out_path, prefix, headers, payload)
        word_times = None

    if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        raise RuntimeError(f"{prefix} wav 파일이 생성되지 않음: {out_path}")

    if not measure_duration:
        return {"text": sent, "duration": 0.0, "word_times": None}

    import soundfile as sf
    wav, sr = sf.read(out_path)
    duration = round(len(wav) / sr, 2)
    if word_times:
        word_times = _validate_word_times(word_times, duration)
    return {"text": sent, "duration": duration, "word_times": word_times}


async def generate_tts_typecast(tts_dir, sentences, voice_id=None, speed=None, emotion=None, api_key=None, measure_duration=True, with_timestamps=True):
    """
    Typecast API TTS (고품질 한국어). 5줄 병렬 처리.
    반환: raw_timings (문장별 {text, duration, word_times} 목록, sentences 순서 보존)

    measure_duration=False면 sf.read 디코드를 건너뛴다(미리듣기 전용, duration 0.0).
    with_timestamps=True면 어절별 (start,end) 를 word_times 로 함께 저장(자막-음성 동기화용).
    미리듣기 샘플만 with_timestamps=False. 기본 True라 영상/preview-build 경로는 자동 획득.
    """
    from config import settings

    key = api_key
    if not key:
        raise RuntimeError("Typecast API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 Typecast API 키를 저장해주세요.")

    vid = voice_id or "tc_62e8f21e979b3860fe2f6a24"
    model = _TYPECAST_MODEL
    headers = {"X-API-KEY": key, "Content-Type": "application/json"}

    raw_timings = await _run_sentence_jobs(
        _TYPECAST_MAX_CONCURRENCY,
        [
            partial(
                _generate_one_sentence_typecast,
                tts_dir, i, sent, headers, vid, model, speed, emotion, measure_duration, with_timestamps,
            )
            for i, sent in enumerate(sentences)
        ],
    )

    with open(os.path.join(tts_dir, "timings_raw.json"), "w", encoding="utf-8") as f:
        json.dump(raw_timings, f, ensure_ascii=False, indent=2)

    return raw_timings


# ──────────────────────────────────────────────────────────────
# ElevenLabs
# ──────────────────────────────────────────────────────────────
# ElevenLabs 는 어절이 아니라 "글자(character) 단위" 타임스탬프를 준다.
# 공백을 기준으로 글자들을 묶으면 Typecast 와 동일한 어절 word_times 가 나온다
# (어절 시작 = 첫 글자 start, 끝 = 마지막 글자 end). 자막-음성 동기화 파이프라인은
# 그대로 재사용된다. 글자 원본(char_alignment)도 함께 저장해 미래 확장에 대비한다.


def _alignment_to_word_times(alignment):
    """ElevenLabs 글자 정렬 → [{"text","start","end"}] 어절 리스트. 형식 이상이면 None.

    공백(space/tab/newline)을 어절 경계로 사용한다. 구두점은 자연히 앞 단어에 붙는다.
    앞뒤 공백은 빈 단어를 만들지 않는다. 결과가 비면 None(호출부가 비례 폴백).
    """
    if not isinstance(alignment, dict):
        return None
    chars = alignment.get("characters")
    starts = alignment.get("character_start_times_seconds")
    ends = alignment.get("character_end_times_seconds")
    if not (isinstance(chars, list) and isinstance(starts, list) and isinstance(ends, list)):
        return None
    n = len(chars)
    if n == 0 or len(starts) != n or len(ends) != n:
        return None

    words = []
    cur_text = ""
    cur_start = None
    cur_end = None
    try:
        for i in range(n):
            ch = chars[i]
            if not isinstance(ch, str):
                return None
            if ch.isspace():
                if cur_text:
                    words.append({
                        "text": cur_text,
                        "start": round(float(cur_start), 3),
                        "end": round(float(cur_end), 3),
                    })
                    cur_text, cur_start, cur_end = "", None, None
                continue
            if not cur_text:
                cur_start = starts[i]
            cur_text += ch
            cur_end = ends[i]
        if cur_text:
            words.append({
                "text": cur_text,
                "start": round(float(cur_start), 3),
                "end": round(float(cur_end), 3),
            })
    except (TypeError, ValueError):
        return None
    return words or None


def _pack_char_alignment(alignment):
    """원본 글자 정렬을 저장용 축약 형태 {characters, start_times, end_times} 로. 이상이면 None."""
    if not isinstance(alignment, dict):
        return None
    chars = alignment.get("characters")
    starts = alignment.get("character_start_times_seconds")
    ends = alignment.get("character_end_times_seconds")
    if not (isinstance(chars, list) and isinstance(starts, list) and isinstance(ends, list)):
        return None
    n = len(chars)
    if n == 0 or len(starts) != n or len(ends) != n:
        return None
    try:
        return {
            "characters": [str(c) for c in chars],
            "start_times": [round(float(s), 3) for s in starts],
            "end_times": [round(float(e), 3) for e in ends],
        }
    except (TypeError, ValueError):
        return None


def _eleven_decode_to_wav(mp3_bytes, mp3_path, out_path, prefix, atempo=None):
    """ElevenLabs mp3 바이트 → 번들 ffmpeg 로 sent_XX.wav(pcm 44100 mono) 디코드.

    SAC(Smart App Control)가 ffmpeg 실행을 통째로 막는 경우(WinError 4551)는
    프론트가 감지하는 표식 문구로 감싸 재던진다."""
    import subprocess
    from core.ffmpeg import FFMPEG
    from core.app_control import is_app_control_block, SAC_MESSAGE_VOICE

    with open(mp3_path, "wb") as f:
        f.write(mp3_bytes)
    # atempo 는 음높이를 건드리지 않고 속도만 바꾼다. 한 번에 0.5~2.0 배까지 가능하며
    # 우리 허용 범위(0.7~1.2)는 그 안에 들어간다. dialogue 응답에 배속을 걸 때만 쓴다.
    tempo_args = []
    if atempo and abs(float(atempo) - 1.0) > 1e-6:
        tempo_args = ["-filter:a", f"atempo={float(atempo):.4f}"]
    try:
        subprocess.run(
            [FFMPEG, "-y", "-nostdin", "-v", "error", "-i", mp3_path,
             *tempo_args, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out_path],
            check=True, capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError) as e:
        if is_app_control_block(e):
            raise RuntimeError(f"{SAC_MESSAGE_VOICE} (WinError 4551)")
        stderr = ""
        if isinstance(getattr(e, "stderr", None), (bytes, bytearray)):
            stderr = e.stderr.decode("utf-8", "replace")
        raise RuntimeError(f"{prefix} mp3→wav 변환 실패: {stderr[:200] or e}")
    finally:
        try:
            os.remove(mp3_path)
        except OSError:
            pass


def _generate_dialogue_batch(
    tts_dir, indices, sentences, api_key, voice_id, model_id, stability, speed,
):
    """indices 줄들을 한 번의 text-to-dialogue 호출로 합성하고 줄별 sent_XX.wav 로 나눈다.

    반환: {index: {"text", "duration", "word_times", "char_alignment"}}

    줄별 호출(_generate_one_sentence_elevenlabs)과 반환 shape 이 같아서 호출부는 구분 없이
    쓸 수 있다. 실패 시 줄별 호출로 몰래 되돌리지 않는다 — 톤 특성이 달라지는데 사용자는
    이유를 알 수 없고, 부분 실패면 크레딧만 두 번 나가기 때문.
    """
    import base64
    import requests
    import soundfile as sf

    prefix = f"[ElevenLabs dialogue {indices[0]:02d}~{indices[-1]:02d}]"
    tempo = min(max(_coerce_float(speed, 1.0), _ELEVEN_SPEED_MIN), _ELEVEN_SPEED_MAX)

    body = {
        "inputs": [{"text": sentences[i], "voice_id": voice_id} for i in indices],
        "model_id": model_id or "eleven_v3",
        # dialogue 가 받는 설정은 stability 하나뿐이다. similarity_boost·style·speed 는
        # 스펙에 없고 보내도 조용히 무시된다(2026-07 실측 — speed 0.7 과 1.2 의 길이가 동일).
        # 속도는 아래에서 ffmpeg atempo 로 직접 건다.
        "settings": {"stability": stability},
    }
    resp = requests.post(
        f"{_ELEVEN_BASE}/v1/text-to-dialogue/with-timestamps",
        headers={"xi-api-key": api_key, "Content-Type": "application/json"},
        json=body, params={"output_format": "mp3_44100_128"}, timeout=180,
    )
    if resp.status_code == 401:
        raise RuntimeError(f"{prefix} ElevenLabs API 키가 유효하지 않습니다 (401)")
    if resp.status_code == 429:
        raise RuntimeError(f"{prefix} ElevenLabs rate limit (429)")
    if resp.status_code >= 400:
        raise RuntimeError(f"{prefix} HTTP {resp.status_code}: {resp.text[:200]}")

    try:
        data = resp.json()
    except ValueError as e:
        raise RuntimeError(f"{prefix} 응답을 해석하지 못했습니다: {e}")
    audio_b64 = data.get("audio_base64")
    if not audio_b64:
        raise RuntimeError(f"{prefix} 오디오 응답이 비어있습니다")

    spans = _dialogue_spans(data.get("voice_segments"), len(indices), prefix)
    alignment = data.get("alignment") or data.get("normalized_alignment")

    batch_mp3 = os.path.join(tts_dir, f"_dlg_{indices[0]:02d}.mp3")
    batch_wav = os.path.join(tts_dir, f"_dlg_{indices[0]:02d}.wav")
    try:
        # 배속(atempo)은 여기서 한 번에 건다 — 줄별로 걸면 ffmpeg 를 줄 수만큼 부르게 된다.
        _eleven_decode_to_wav(
            base64.b64decode(audio_b64), batch_mp3, batch_wav, prefix, atempo=tempo,
        )
        wav, sr = sf.read(batch_wav)
        if getattr(wav, "ndim", 1) > 1:
            wav = wav.mean(axis=1)
        out = {}
        for k, idx in enumerate(indices):
            t0, t1, cs, ce = spans[k]
            s0, s1 = t0 / tempo, t1 / tempo
            a0 = max(0, min(int(round(s0 * sr)), len(wav)))
            a1 = max(a0, min(int(round(s1 * sr)), len(wav)))
            piece = wav[a0:a1]
            sf.write(os.path.join(tts_dir, f"sent_{idx:02d}.wav"), piece, sr, subtype="PCM_16")

            sliced = _slice_alignment(alignment, cs, ce, s0, tempo)
            duration = round(len(piece) / sr, 2)
            word_times = _alignment_to_word_times(sliced)
            if word_times:
                word_times = _validate_word_times(word_times, duration)
            out[idx] = {
                "text": sentences[idx],
                "duration": duration,
                "word_times": word_times,
                "char_alignment": _pack_char_alignment(sliced),
            }
        return out
    finally:
        # 배치 임시 wav 는 줄별로 나눈 뒤엔 쓸모없다. 실패해도(디코드 도중 죽어도) 지운다 —
        # 안 지우면 세션 폴더에 반쪽짜리 파일이 쌓인다. mp3 는 _eleven_decode_to_wav 가 치운다.
        for p in (batch_wav,):
            try:
                os.remove(p)
            except OSError:
                pass


async def _generate_dialogue_elevenlabs(
    tts_dir, sentences, indices, api_key, voice_id, model_id, stability, speed,
):
    """indices 를 글자 수 배치로 나눠 dialogue 로 합성. 배치들은 병렬로 돈다."""
    batches = _dialogue_batches(indices, sentences)
    results = await _run_sentence_jobs(
        _ELEVEN_MAX_CONCURRENCY,
        [
            partial(
                _generate_dialogue_batch,
                tts_dir, batch, sentences, api_key, voice_id, model_id, stability, speed,
            )
            for batch in batches
        ],
    )
    merged: dict[int, dict] = {}
    for part in results:
        merged.update(part or {})
    return merged


def _generate_one_sentence_elevenlabs(
    tts_dir, index, sent, api_key, voice_id, model_id,
    stability, similarity_boost, style, speed,
    measure_duration=True, with_timestamps=True,
    prev_text=None, next_text=None,
):
    """한 문장만 ElevenLabs 로 합성하고 sent_XX.wav 저장.
    {text, duration, word_times, char_alignment} 반환.

    with_timestamps=True면 /with-timestamps 로 글자별 정렬을 받아 어절 word_times +
    char_alignment 로 돌려준다. 4xx/5xx·응답 이상 시 플레인 엔드포인트로 폴백
    (word_times=None) — v3 가 with-timestamps 를 거부해도 이 경로로 자동 강등된다.
    401/429 는 폴백 없이 그대로 에러.

    prev_text/next_text 는 발음 참고용 앞뒤 문맥(생성되지 않고 과금도 안 됨).
    지원 모델에서만 채워 넘길 것 — _eleven_context 참고.
    """
    import base64
    import requests

    prefix = f"[ElevenLabs sent_{index:02d}]"
    out_path = os.path.join(tts_dir, f"sent_{index:02d}.wav")
    mp3_path = os.path.join(tts_dir, f"sent_{index:02d}.mp3")

    body = {
        "text": sent,
        "model_id": model_id or _ELEVEN_DEFAULT_MODEL,
        "voice_settings": {
            "stability": stability,
            "similarity_boost": similarity_boost,
            "style": style,
            "speed": min(max(_coerce_float(speed, 1.0), _ELEVEN_SPEED_MIN), _ELEVEN_SPEED_MAX),
            "use_speaker_boost": True,
        },
    }
    if prev_text:
        body["previous_text"] = prev_text
    if next_text:
        body["next_text"] = next_text
    headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
    params = {"output_format": "mp3_44100_128"}

    word_times = None
    char_alignment = None
    audio_bytes = None

    if with_timestamps:
        resp = requests.post(
            f"{_ELEVEN_BASE}/v1/text-to-speech/{voice_id}/with-timestamps",
            headers=headers, json=body, params=params, timeout=60,
        )
        if resp.status_code == 401:
            raise RuntimeError(f"{prefix} ElevenLabs API 키가 유효하지 않습니다 (401)")
        if resp.status_code == 429:
            raise RuntimeError(f"{prefix} ElevenLabs rate limit (429)")
        if resp.status_code >= 400:
            print(f"{prefix} with-timestamps HTTP {resp.status_code}: {resp.text[:200]} → 플레인 폴백")
        else:
            try:
                data = resp.json()
                audio_b64 = data.get("audio_base64")
                if audio_b64:
                    audio_bytes = base64.b64decode(audio_b64)
                    alignment = data.get("alignment") or data.get("normalized_alignment")
                    word_times = _alignment_to_word_times(alignment)
                    char_alignment = _pack_char_alignment(alignment)
                else:
                    print(f"{prefix} with-timestamps 응답에 audio_base64 없음 → 플레인 폴백")
            except Exception as e:
                print(f"{prefix} with-timestamps 파싱 실패({e}) → 플레인 폴백")

    if audio_bytes is None:
        resp = requests.post(
            f"{_ELEVEN_BASE}/v1/text-to-speech/{voice_id}",
            headers=headers, json=body, params=params, timeout=60,
        )
        if resp.status_code == 401:
            raise RuntimeError(f"{prefix} ElevenLabs API 키가 유효하지 않습니다 (401)")
        if resp.status_code == 429:
            raise RuntimeError(f"{prefix} ElevenLabs rate limit (429)")
        if resp.status_code >= 400:
            raise RuntimeError(f"{prefix} HTTP {resp.status_code}: {resp.text[:200]}")
        audio_bytes = resp.content
        word_times = None
        char_alignment = None

    if not audio_bytes:
        raise RuntimeError(f"{prefix} 오디오 응답이 비어있습니다")

    _eleven_decode_to_wav(audio_bytes, mp3_path, out_path, prefix)

    if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        raise RuntimeError(f"{prefix} wav 파일이 생성되지 않음: {out_path}")

    if not measure_duration:
        return {"text": sent, "duration": 0.0, "word_times": None, "char_alignment": None}

    import soundfile as sf
    wav, sr = sf.read(out_path)
    duration = round(len(wav) / sr, 2)
    if word_times:
        word_times = _validate_word_times(word_times, duration)
    return {"text": sent, "duration": duration, "word_times": word_times, "char_alignment": char_alignment}


def _eleven_opts(tts_options):
    """tts_options(dict|None) → (model_id, stability, similarity_boost, style) 정규화."""
    opts = tts_options or {}
    return (
        opts.get("model_id") or _ELEVEN_DEFAULT_MODEL,
        _coerce_float(opts.get("stability"), 0.5),
        _coerce_float(opts.get("similarity_boost"), 0.75),
        _coerce_float(opts.get("style"), 0.0),
    )


async def generate_tts_elevenlabs(
    tts_dir, sentences, voice_id=None, speed=None, api_key=None,
    tts_options=None, measure_duration=True, with_timestamps=True,
):
    """ElevenLabs API TTS. 문장별 병렬 처리.
    반환: raw_timings (문장별 {text, duration, word_times, char_alignment}, 순서 보존)

    v3 는 줄별 호출 대신 대본을 한 번에 넣는 dialogue 경로로 간다(줄별 톤 흔들림 해소).
    """
    if not api_key:
        raise RuntimeError("ElevenLabs API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 ElevenLabs API 키를 저장해주세요.")
    if not voice_id:
        raise RuntimeError("ElevenLabs 음성이 선택되지 않았습니다. 음성 목록에서 성우를 선택해주세요.")

    model_id, stability, similarity_boost, style = _eleven_opts(tts_options)

    if _uses_dialogue(model_id):
        merged = await _generate_dialogue_elevenlabs(
            tts_dir, sentences, list(range(len(sentences))),
            api_key, voice_id, model_id, stability, speed,
        )
        raw_timings = [merged[i] for i in range(len(sentences))]
        with open(os.path.join(tts_dir, "timings_raw.json"), "w", encoding="utf-8") as f:
            json.dump(raw_timings, f, ensure_ascii=False, indent=2)
        return raw_timings

    raw_timings = await _run_sentence_jobs(
        _ELEVEN_MAX_CONCURRENCY,
        [
            partial(
                _generate_one_sentence_elevenlabs,
                tts_dir, i, sent, api_key, voice_id, model_id,
                stability, similarity_boost, style, speed,
                measure_duration, with_timestamps,
                *_eleven_context(sentences, i, model_id),
            )
            for i, sent in enumerate(sentences)
        ],
    )

    with open(os.path.join(tts_dir, "timings_raw.json"), "w", encoding="utf-8") as f:
        json.dump(raw_timings, f, ensure_ascii=False, indent=2)

    return raw_timings


async def generate_tts(
    engine, tts_dir, sentences, *, voice_id=None, speed=None, emotion=None,
    api_key=None, tts_options=None, measure_duration=True, with_timestamps=True,
):
    """엔진 디스패처 — engine 값에 따라 Typecast/ElevenLabs 로 위임.
    반환 shape 은 두 엔진 모두 문장별 {text, duration, word_times, ...} 로 동일."""
    if engine == "elevenlabs":
        return await generate_tts_elevenlabs(
            tts_dir, sentences, voice_id=voice_id, speed=speed, api_key=api_key,
            tts_options=tts_options, measure_duration=measure_duration,
            with_timestamps=with_timestamps,
        )
    return await generate_tts_typecast(
        tts_dir, sentences, voice_id=voice_id, speed=speed, emotion=emotion,
        api_key=api_key, measure_duration=measure_duration, with_timestamps=with_timestamps,
    )


async def generate_tts_for_indices(
    tts_dir: str,
    sentences: list[str],
    indices: list[int],
    voice_id: str | None = None,
    speed: float | None = None,
    emotion: str | None = None,
    api_key: str | None = None,
    engine: str = "typecast",
    tts_options: dict | None = None,
) -> dict[int, dict]:
    """sentences 중 indices 위치만 선택한 엔진으로 합성.

    incremental 재빌드용. timings_raw.json은 호출자가 갱신 책임을 가짐
    (전체 timings 머지 후 한 번에 저장해야 일관성 유지 가능).

    반환: {index: {"text", "duration", "word_times", ...}} — indices에 해당하는 결과만.
    """
    if not indices:
        return {}

    if engine == "elevenlabs":
        if not api_key:
            raise RuntimeError("ElevenLabs API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 ElevenLabs API 키를 저장해주세요.")
        if not voice_id:
            raise RuntimeError("ElevenLabs 음성이 선택되지 않았습니다. 음성 목록에서 성우를 선택해주세요.")
        model_id, stability, similarity_boost, style = _eleven_opts(tts_options)
        if _uses_dialogue(model_id):
            # 고친 줄들만 한 번의 dialogue 호출로 묶는다. 손대지 않은 줄을 문맥 삼아 같이
            # 보내지 않는 이유는 위 dialogue 주석 참고 — 톤이 더 맞지도 않으면서 그 줄들
            # 값까지 과금된다(실측: 창 26Hz vs 단독 28Hz, 줄 사이 자연 편차 30Hz).
            return await _generate_dialogue_elevenlabs(
                tts_dir, sentences, list(indices),
                api_key, voice_id, model_id, stability, speed,
            )
        results = await _run_sentence_jobs(
            _ELEVEN_MAX_CONCURRENCY,
            [
                partial(
                    _generate_one_sentence_elevenlabs,
                    tts_dir, i, sentences[i], api_key, voice_id, model_id,
                    stability, similarity_boost, style, speed,
                    True, True,  # measure_duration, with_timestamps (기본값 유지)
                    *_eleven_context(sentences, i, model_id),
                )
                for i in indices
            ],
        )
        return {idx: r for idx, r in zip(indices, results)}

    if not api_key:
        raise RuntimeError("Typecast API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 Typecast API 키를 저장해주세요.")

    vid = voice_id or "tc_62e8f21e979b3860fe2f6a24"
    model = _TYPECAST_MODEL
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    results = await _run_sentence_jobs(
        _TYPECAST_MAX_CONCURRENCY,
        [
            partial(
                _generate_one_sentence_typecast,
                tts_dir, i, sentences[i], headers, vid, model, speed, emotion,
            )
            for i in indices
        ],
    )
    return {idx: r for idx, r in zip(indices, results)}
