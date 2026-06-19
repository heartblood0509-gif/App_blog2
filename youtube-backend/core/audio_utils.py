"""오디오 처리 유틸리티 (build_shorts.py에서 복사)"""

import shlex
import subprocess
import sys
import json
import os
import numpy as np
import soundfile as sf

from core.ffmpeg import FFMPEG, FFMPEG_Q


def run(cmd, desc="", cwd=None):
    """ffmpeg 명령 실행.

    cwd: 서브프로세스 작업 폴더. drawtext 의 fontfile 을 "파일명만"으로 넘기고 cwd 를
    폰트 폴더로 지정하면, 윈도우 경로(C:\\...\\font.otf)의 드라이브 콜론·역슬래시가 ffmpeg
    필터 파서에서 깨지는 문제를 원천 회피한다(맥/윈도우 동일 동작). 입력/출력은 절대경로라
    cwd 변경에 영향받지 않는다.
    """
    if sys.platform == "win32":
        args = cmd
    else:
        args = shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg 에러: {result.stderr[-1000:]}")
    return result


def is_playable_wav(path: str) -> bool:
    """stdlib wave 로 PCM WAV 구조를 검증한다(서브프로세스 없음, 빠름).

    파일이 열리고 nframes>0 · framerate>0 이면 True. 12바이트 매직 비교보다
    엄격해서 비-PCM/헤더 깨짐/빈 파일/HTML·MP3 바이트를 잡아낸다.
    미리듣기 캐시를 서빙하기 전 게이트 + 레거시 불량 캐시 자가치유 판정에 쓴다.
    """
    import wave
    try:
        with wave.open(path, "rb") as w:
            return w.getnframes() > 0 and w.getframerate() > 0
    except Exception:
        return False


def normalize_to_browser_wav(src: str, dst: str) -> None:
    """임의 오디오(src)를 브라우저 재생용 표준 WAV(PCM s16le, 44.1kHz)로 변환해 dst에 쓴다.

    ffmpeg는 MP3·변종 WAV 등을 폭넓게 디코드하므로, Typecast가 무엇을 주든 모든
    브라우저(<audio>)가 재생 가능한 파일로 표준화된다. ffmpeg가 src를 못 읽거나
    (빈/HTML/잘림/디코드 불가) ffmpeg 바이너리 자체가 없으면 RuntimeError를 던진다.
    호출자는 RuntimeError를 '캐시 금지(불량)'로 취급해야 한다.
    """
    cmd = [
        FFMPEG, "-y", "-nostdin", "-v", "error",
        "-i", src,
        "-vn", "-map", "0:a:0",
        "-c:a", "pcm_s16le", "-ar", "44100",
        "-f", "wav", dst,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    except OSError as e:
        # ffmpeg 바이너리 부재(FileNotFoundError) 등 — run()은 returncode만 보므로 여기서 명시 포착.
        raise RuntimeError(f"ffmpeg 실행 불가: {e}")
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg 정규화 실패: {result.stderr[-500:]}")


def extract_sentence_from_warmup(wav, sr):
    """
    '음. [문장]' TTS 출력에서 실제 문장 부분만 추출.
    워밍업 '음.' 이후 무음 구간을 찾고 실제 음성 시작점부터 추출.
    """
    abs_wav = np.abs(wav)
    window = int(sr * 0.02)
    step = window // 2

    energies = []
    for i in range(0, len(abs_wav) - window, step):
        energies.append((i, np.mean(abs_wav[i : i + window])))

    first_speech = False
    pause_found = False
    pause_pos = 0

    for pos, eng in energies:
        t_ms = pos / sr * 1000
        if eng > 0.03 and not first_speech:
            first_speech = True
        elif eng < 0.01 and first_speech and t_ms > 200:
            pause_pos = pos
            pause_found = True
            break

    if not pause_found:
        pause_pos = int(sr * 0.5)

    sentence_start = pause_pos
    for pos, eng in energies:
        if pos > pause_pos and eng > 0.02:
            sentence_start = max(0, pos - int(sr * 0.005))
            break

    return wav[sentence_start:]


def trim_trailing_silence(wav, sr, threshold=0.005):
    """끝부분 무음만 제거 (시작은 보존)"""
    abs_wav = np.abs(wav)
    window = int(sr * 0.02)

    end = len(abs_wav)
    for i in range(len(abs_wav) - window, 0, -(window // 2)):
        if np.mean(abs_wav[i : i + window]) > threshold:
            end = min(len(abs_wav), i + window + int(sr * 0.1))
            break

    if end < len(abs_wav) * 0.7:
        return wav

    return wav[:end]


def apply_fade(wav, sr, fade_in_ms=15, fade_out_ms=10):
    """부드러운 페이드 인/아웃"""
    fade_in_samples = int(sr * fade_in_ms / 1000)
    fade_out_samples = int(sr * fade_out_ms / 1000)
    wav = wav.copy()
    if len(wav) > fade_in_samples:
        wav[:fade_in_samples] *= np.linspace(0, 1, fade_in_samples)
    if len(wav) > fade_out_samples:
        wav[-fade_out_samples:] *= np.linspace(1, 0, fade_out_samples)
    return wav


def speed_up_sentences(temp_dir, sentences, tts_speed=1.0):
    """각 문장 WAV에 atempo 적용, 최종 듀레이션 반환"""
    final_durations = []

    for i in range(len(sentences)):
        sent_path = os.path.join(temp_dir, f"sent_{i:02d}.wav")
        sent_fast_path = os.path.join(temp_dir, f"sent_{i:02d}_fast.wav")

        if tts_speed > 1.0:
            run(
                f'{FFMPEG_Q} -y -i "{sent_path}" -filter:a "atempo={tts_speed}" "{sent_fast_path}"',
                f"문장 {i + 1} → {tts_speed}x",
            )
            wav, sr = sf.read(sent_fast_path)
        else:
            wav, sr = sf.read(sent_path)
            sf.write(sent_fast_path, wav, sr)

        dur = len(wav) / sr
        final_durations.append(round(dur, 2))

    return final_durations


def build_aligned_narration(temp_dir, sentences, clip_starts, total_dur):
    """문장별 WAV를 클립 시작에 맞춰 배치"""
    wav0, sr = sf.read(os.path.join(temp_dir, "sent_00_fast.wav"))
    total_samples = int(total_dur * sr) + sr
    aligned = np.zeros(total_samples)
    aligned_timings = []

    for i in range(len(sentences)):
        if i >= len(clip_starts):
            break
        fast_path = os.path.join(temp_dir, f"sent_{i:02d}_fast.wav")
        wav, _ = sf.read(fast_path)
        sent_dur = len(wav) / sr

        offset = clip_starts[i]
        start_sample = int(offset * sr)
        end_sample = start_sample + len(wav)

        if end_sample <= len(aligned):
            aligned[start_sample:end_sample] += wav
        else:
            avail = len(aligned) - start_sample
            if avail > 0:
                aligned[start_sample : start_sample + avail] += wav[:avail]
            sent_dur = avail / sr

        aligned_timings.append(
            {
                "text": sentences[i],
                "offset": round(offset, 2),
                "duration": round(sent_dur, 2),
                "end": round(offset + sent_dur, 2),
            }
        )

    aligned = aligned[: int(total_dur * sr)]

    aligned_wav_path = os.path.join(temp_dir, "narration_aligned.wav")
    mp3_path = os.path.join(temp_dir, "narration.mp3")
    sf.write(aligned_wav_path, aligned, sr)

    run(
        f'{FFMPEG_Q} -y -i "{aligned_wav_path}" -codec:a libmp3lame -b:a 192k "{mp3_path}"',
    )

    return mp3_path, aligned_timings
