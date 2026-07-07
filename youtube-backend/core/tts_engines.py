"""TTS 엔진 통합 (Typecast)"""

import asyncio
import json
import os
import time


V21_ONLY_VOICES = {
    "tc_61659c5818732016a95fe763",
    "tc_6059dad0b83880769a50502f",
    "tc_61de29497924994f5abd68db",
}

# 동시 요청 개수. 디버깅 중: 1로 낮춰 순차 처리 (병렬 처리 때 sent_XX.wav
# 파일이 간헐적으로 손상되는 현상 격리). 원인 확정 후 다시 2~3으로 복원.
_TYPECAST_MAX_CONCURRENCY = 1


def _request_plain(out_path, prefix, headers, payload):
    """플레인 /v1/text-to-speech — 오디오 바이트만 받아 out_path 에 쓴다(타임스탬프 없음).

    실패 지점(HTTP 에러·polling 타임아웃)마다 RuntimeError. with-timestamps 실패 시 폴백 대상.
    """
    import requests

    resp = requests.post(
        "https://api.typecast.ai/v1/text-to-speech",
        headers=headers,
        json=payload,
        timeout=60,
    )
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

        resp = requests.post(
            "https://api.typecast.ai/v1/text-to-speech/with-timestamps",
            headers=headers,
            json=payload,
            params={"granularity": "word"},
            timeout=60,
        )
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
    model = "ssfm-v21" if vid in V21_ONLY_VOICES else "ssfm-v30"
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


async def generate_tts_for_indices(
    tts_dir: str,
    sentences: list[str],
    indices: list[int],
    voice_id: str | None = None,
    speed: float | None = None,
    emotion: str | None = None,
    api_key: str | None = None,
) -> dict[int, dict]:
    """sentences 중 indices 위치만 Typecast로 합성.

    incremental 재빌드용. timings_raw.json은 호출자가 갱신 책임을 가짐
    (전체 timings 머지 후 한 번에 저장해야 일관성 유지 가능).

    반환: {index: {"text", "duration"}} — indices에 해당하는 결과만.
    """
    if not indices:
        return {}
    if not api_key:
        raise RuntimeError("Typecast API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 Typecast API 키를 저장해주세요.")

    vid = voice_id or "tc_62e8f21e979b3860fe2f6a24"
    model = "ssfm-v21" if vid in V21_ONLY_VOICES else "ssfm-v30"
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
