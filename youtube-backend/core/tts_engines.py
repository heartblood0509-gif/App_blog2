"""TTS 엔진 통합 (Typecast · ElevenLabs)"""

import asyncio
import json
import os
import time


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
_TYPECAST_MAX_CONCURRENCY = 1

# ElevenLabs — Typecast 의 1(손상 회피)과 무관한 별도 엔진이라 소폭 병렬 허용.
_ELEVEN_BASE = "https://api.elevenlabs.io"
_ELEVEN_MAX_CONCURRENCY = 2
_ELEVEN_DEFAULT_MODEL = "eleven_multilingual_v2"
# ElevenLabs voice_settings.speed 허용 범위(문서 기준 보수적으로 클램프).
_ELEVEN_SPEED_MIN = 0.7
_ELEVEN_SPEED_MAX = 1.2


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

    sem = asyncio.Semaphore(_TYPECAST_MAX_CONCURRENCY)

    async def _one(i, sent):
        async with sem:
            return await asyncio.to_thread(
                _generate_one_sentence_typecast,
                tts_dir, i, sent, headers, vid, model, speed, emotion, measure_duration, with_timestamps,
            )

    tasks = [_one(i, s) for i, s in enumerate(sentences)]
    raw_timings = await asyncio.gather(*tasks)

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


def _eleven_decode_to_wav(mp3_bytes, mp3_path, out_path, prefix):
    """ElevenLabs mp3 바이트 → 번들 ffmpeg 로 sent_XX.wav(pcm 44100 mono) 디코드.

    SAC(Smart App Control)가 ffmpeg 실행을 통째로 막는 경우(WinError 4551)는
    프론트가 감지하는 표식 문구로 감싸 재던진다."""
    import subprocess
    from core.ffmpeg import FFMPEG
    from core.app_control import is_app_control_block, SAC_MESSAGE_VOICE

    with open(mp3_path, "wb") as f:
        f.write(mp3_bytes)
    try:
        subprocess.run(
            [FFMPEG, "-y", "-nostdin", "-v", "error", "-i", mp3_path,
             "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out_path],
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


def _generate_one_sentence_elevenlabs(
    tts_dir, index, sent, api_key, voice_id, model_id,
    stability, similarity_boost, style, speed,
    measure_duration=True, with_timestamps=True,
):
    """한 문장만 ElevenLabs 로 합성하고 sent_XX.wav 저장.
    {text, duration, word_times, char_alignment} 반환.

    with_timestamps=True면 /with-timestamps 로 글자별 정렬을 받아 어절 word_times +
    char_alignment 로 돌려준다. 4xx/5xx·응답 이상 시 플레인 엔드포인트로 폴백
    (word_times=None) — v3 가 with-timestamps 를 거부해도 이 경로로 자동 강등된다.
    401/429 는 폴백 없이 그대로 에러.
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
    """
    if not api_key:
        raise RuntimeError("ElevenLabs API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 ElevenLabs API 키를 저장해주세요.")
    if not voice_id:
        raise RuntimeError("ElevenLabs 음성이 선택되지 않았습니다. 음성 목록에서 성우를 선택해주세요.")

    model_id, stability, similarity_boost, style = _eleven_opts(tts_options)
    sem = asyncio.Semaphore(_ELEVEN_MAX_CONCURRENCY)

    async def _one(i, sent):
        async with sem:
            return await asyncio.to_thread(
                _generate_one_sentence_elevenlabs,
                tts_dir, i, sent, api_key, voice_id, model_id,
                stability, similarity_boost, style, speed,
                measure_duration, with_timestamps,
            )

    tasks = [_one(i, s) for i, s in enumerate(sentences)]
    raw_timings = await asyncio.gather(*tasks)

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
        sem = asyncio.Semaphore(_ELEVEN_MAX_CONCURRENCY)

        async def _one_el(i: int):
            async with sem:
                return await asyncio.to_thread(
                    _generate_one_sentence_elevenlabs,
                    tts_dir, i, sentences[i], api_key, voice_id, model_id,
                    stability, similarity_boost, style, speed,
                )

        results = await asyncio.gather(*[_one_el(i) for i in indices])
        return {idx: r for idx, r in zip(indices, results)}

    if not api_key:
        raise RuntimeError("Typecast API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 Typecast API 키를 저장해주세요.")

    vid = voice_id or "tc_62e8f21e979b3860fe2f6a24"
    model = _TYPECAST_MODEL
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
    sem = asyncio.Semaphore(_TYPECAST_MAX_CONCURRENCY)

    async def _one(i: int):
        async with sem:
            return await asyncio.to_thread(
                _generate_one_sentence_typecast,
                tts_dir, i, sentences[i], headers, vid, model, speed, emotion,
            )

    results = await asyncio.gather(*[_one(i) for i in indices])
    return {idx: r for idx, r in zip(indices, results)}
