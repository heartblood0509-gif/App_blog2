"""미리듣기 선제 방어 단위 테스트.

- is_playable_wav: 캐시 서빙 전 구조 검증(잘림·빈·HTML·MP3 바이트를 잡아내는가)
- normalize_to_browser_wav: 임의 입력을 표준 PCM s16le 44.1kHz WAV로 변환,
  디코드 불가/ffmpeg 부재 시 RuntimeError + 출력 미생성

Typecast·네트워크 없이 합성 파일로만 검증한다. ffmpeg가 필요한 테스트는
ffmpeg 미설치 환경에서 skip.
"""

import os
import shutil
import struct
import wave

import pytest

# tests/conftest.py가 JWT_SECRET 주입 후 import
from core.audio_utils import is_playable_wav, normalize_to_browser_wav

_HAS_FFMPEG = shutil.which("ffmpeg") is not None
requires_ffmpeg = pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg 필요")


def _write_pcm_wav(path: str, sr: int = 16000, duration_sec: float = 0.3, nchannels: int = 1) -> None:
    n = int(sr * duration_sec)
    with wave.open(path, "wb") as w:
        w.setnchannels(nchannels)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<" + "h" * n * nchannels, *([0] * n * nchannels)))


# ── is_playable_wav ──────────────────────────────────────────

def test_is_playable_wav_valid(tmp_path):
    p = str(tmp_path / "ok.wav")
    _write_pcm_wav(p)
    assert is_playable_wav(p) is True


def test_is_playable_wav_empty(tmp_path):
    p = str(tmp_path / "empty.wav")
    open(p, "wb").close()
    assert is_playable_wav(p) is False


def test_is_playable_wav_too_small(tmp_path):
    p = str(tmp_path / "tiny.wav")
    with open(p, "wb") as f:
        f.write(b"RIFF")
    assert is_playable_wav(p) is False


def test_is_playable_wav_mp3_bytes(tmp_path):
    p = str(tmp_path / "fake.wav")
    with open(p, "wb") as f:
        f.write(b"ID3\x03\x00\x00\x00\x00\x00\x00" + b"\xff\xfb\x90\x00" * 16)
    assert is_playable_wav(p) is False


def test_is_playable_wav_html_body(tmp_path):
    p = str(tmp_path / "err.wav")
    with open(p, "wb") as f:
        f.write(b"<!DOCTYPE html><html><body>error</body></html>")
    assert is_playable_wav(p) is False


def test_is_playable_wav_missing(tmp_path):
    assert is_playable_wav(str(tmp_path / "nope.wav")) is False


# ── normalize_to_browser_wav ─────────────────────────────────

@requires_ffmpeg
def test_normalize_valid_resamples_to_44100(tmp_path):
    src = str(tmp_path / "src.wav")
    dst = str(tmp_path / "dst.wav")
    _write_pcm_wav(src, sr=16000)
    normalize_to_browser_wav(src, dst)
    assert os.path.exists(dst)
    assert is_playable_wav(dst)
    with wave.open(dst, "rb") as w:
        assert w.getframerate() == 44100  # 리샘플 증명
        assert w.getsampwidth() == 2       # s16le


@requires_ffmpeg
def test_normalize_empty_raises_and_no_output(tmp_path):
    src = str(tmp_path / "empty.bin")
    dst = str(tmp_path / "out.wav")
    open(src, "wb").close()
    with pytest.raises(RuntimeError):
        normalize_to_browser_wav(src, dst)
    assert not os.path.exists(dst)


@requires_ffmpeg
def test_normalize_html_raises(tmp_path):
    src = str(tmp_path / "err.bin")
    dst = str(tmp_path / "out.wav")
    with open(src, "wb") as f:
        f.write(b"<!DOCTYPE html><html>nope</html>")
    with pytest.raises(RuntimeError):
        normalize_to_browser_wav(src, dst)
    assert not os.path.exists(dst)


@requires_ffmpeg
def test_normalize_garbage_raises(tmp_path):
    src = str(tmp_path / "junk.bin")
    dst = str(tmp_path / "out.wav")
    with open(src, "wb") as f:
        f.write(b"ID3" + os.urandom(256))
    with pytest.raises(RuntimeError):
        normalize_to_browser_wav(src, dst)


def test_normalize_missing_ffmpeg_maps_to_runtimeerror(tmp_path, monkeypatch):
    """ffmpeg 바이너리 부재(FileNotFoundError)를 RuntimeError로 매핑하는지."""
    import core.audio_utils as au

    src = str(tmp_path / "src.wav")
    dst = str(tmp_path / "dst.wav")
    _write_pcm_wav(src)

    def _boom(*a, **k):
        raise FileNotFoundError("ffmpeg not found")

    monkeypatch.setattr(au.subprocess, "run", _boom)
    with pytest.raises(RuntimeError):
        au.normalize_to_browser_wav(src, dst)
