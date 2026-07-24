"""완성 후 대본 수정이 최종 렌더에 반영되지 않던 버그의 서버측 방어 테스트.

두 축을 검증한다.
1. Fix #1(백엔드): 세션 매니페스트(get_preview_session)가 line_texts(빌드 당시 원문)를
   line_ids 와 같은 순서로 돌려줘야 한다 — 프론트가 재열기 시 dirty 를 정확히 판정하는 근거.
2. Fix #3: confirm 직전 백스톱 _voice_script_mismatch 가 signature(음성 지문)와 현재 대본을
   대조해, 대본을 고쳤는데 음성을 새로 안 만든 경우를 잡아낸다(옛 목소리 렌더 차단).
"""

import asyncio
import json
import os
import struct
import wave

import pytest

from api.routes import tts_preview as tp
from api.routes.preview import _voice_script_mismatch
from core.user_assets_visual import line_text_hash


# ── 공용 헬퍼 ────────────────────────────────────────────────


def _write_dummy_wav(path: str, duration_sec: float = 0.3) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sr = 16000
    n = int(sr * duration_sec)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(struct.pack("<" + "h" * n, *([0] * n)))


def _seed_session(session_dir, lines, *, voice=None, with_metadata=True):
    """sent_*.wav + signature.json (+ metadata.json) 을 세션 폴더에 주입.

    lines: [(line_id, text), ...] — 저장된 음성이 기준으로 삼은 문장.
    """
    voice = voice or ["voice-A", 1.0, None, "typecast"]
    session_dir.mkdir(parents=True, exist_ok=True)
    for i, (_lid, _text) in enumerate(lines):
        _write_dummy_wav(str(session_dir / f"sent_{i:02d}.wav"))
    signature = {
        "voice": voice,
        "line_order": [lid for lid, _ in lines],
        "line_hashes": {lid: line_text_hash(text) for lid, text in lines},
    }
    (session_dir / "signature.json").write_text(json.dumps(signature), encoding="utf-8")
    if with_metadata:
        metadata = {
            "voice_id": voice[0],
            "engine": "typecast",
            "tts_options": None,
            "speed": voice[1],
            "emotion": None,
            "original_sentences": [text for _, text in lines],
            "expanded_sentences": [text for _, text in lines],
            "durations": [0.3] * len(lines),
            "word_times": [None] * len(lines),
            "split_from_map": {},
            "content_type": "user_assets",
            "user_id": "testuser0001",
        }
        (session_dir / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")


def _lines(*pairs):
    """[(id, text)] → job.script_json 형태의 dict 리스트."""
    return [{"line_id": lid, "text": text, "status": "ready"} for lid, text in pairs]


# ─────────────────────────────────────────────────────────────
# Fix #3 — _voice_script_mismatch (confirm 백스톱)
# ─────────────────────────────────────────────────────────────


def test_mismatch_none_when_script_unchanged(tmp_path):
    """음성과 대본이 같으면 통과(None)."""
    sd = tmp_path / "sess"
    seed = [("l1", "안녕하세요"), ("l2", "반갑습니다")]
    _seed_session(sd, seed)
    assert _voice_script_mismatch(str(sd), _lines(*seed)) is None


def test_mismatch_detected_when_line_edited(tmp_path):
    """한 줄을 고쳤는데 음성을 새로 안 만든 경우 → 그 줄 번호를 담은 메시지 반환."""
    sd = tmp_path / "sess"
    _seed_session(sd, [("l1", "안녕하세요"), ("l2", "반갑습니다")])
    # 2번째 줄 대본만 수정됨(음성은 그대로 = 옛 signature)
    edited = _lines(("l1", "안녕하세요"), ("l2", "정말 반갑습니다"))
    msg = _voice_script_mismatch(str(sd), edited)
    assert msg is not None
    assert "2번째 줄" in msg


def test_mismatch_ignores_whitespace(tmp_path):
    """buildVoices 는 trim 후 음성을 만든다 → 저장 텍스트의 앞뒤 공백만 다른 건 오탐이 아니어야."""
    sd = tmp_path / "sess"
    _seed_session(sd, [("l1", "안녕하세요"), ("l2", "반갑습니다")])
    # 저장된 텍스트에 앞뒤 공백/개행이 붙었지만 실질 내용은 동일
    padded = _lines(("l1", "  안녕하세요 "), ("l2", "반갑습니다\n"))
    assert _voice_script_mismatch(str(sd), padded) is None


def test_mismatch_on_line_count_change(tmp_path):
    """줄을 추가/삭제했는데 재빌드 안 함 → 줄 수 불일치 메시지."""
    sd = tmp_path / "sess"
    _seed_session(sd, [("l1", "안녕하세요"), ("l2", "반갑습니다")])
    added = _lines(("l1", "안녕하세요"), ("l2", "반갑습니다"), ("l3", "또 만나요"))
    msg = _voice_script_mismatch(str(sd), added)
    assert msg is not None
    assert "줄 수" in msg


def test_mismatch_on_line_reorder(tmp_path):
    """줄을 드래그로 옮겼는데 재빌드 안 함 → 순서 불일치 메시지.

    줄별 해시 검사는 line_id 기준이라 이 경우를 통과시키는데, 렌더는 sent_XX.wav 를 인덱스로
    짝짓기 때문에 그대로 두면 화면과 목소리가 어긋난 영상이 조용히 완성된다.
    """
    sd = tmp_path / "sess"
    _seed_session(sd, [("l1", "안녕하세요"), ("l2", "반갑습니다"), ("l3", "또 만나요")])
    # 같은 줄·같은 텍스트, 순서만 뒤바뀜
    swapped = _lines(("l3", "또 만나요"), ("l1", "안녕하세요"), ("l2", "반갑습니다"))
    msg = _voice_script_mismatch(str(sd), swapped)
    assert msg is not None
    assert "순서" in msg


def test_mismatch_none_when_no_signature(tmp_path):
    """구세션(signature 없음)은 검증 불가 → 통과(None). 프론트 dirty 감지에 의존."""
    sd = tmp_path / "sess"
    sd.mkdir(parents=True, exist_ok=True)
    _write_dummy_wav(str(sd / "sent_00.wav"))
    assert _voice_script_mismatch(str(sd), _lines(("l1", "아무거나"))) is None


def test_mismatch_none_when_sig_dir_absent(tmp_path):
    """세션 폴더 자체가 없어도 크래시 없이 None."""
    assert _voice_script_mismatch(str(tmp_path / "nope"), _lines(("l1", "x"))) is None


def test_mismatch_on_missing_line_id(tmp_path):
    """현재 줄에 line_id 가 없으면(구 데이터) 안전하게 불일치로 처리 → 재빌드 유도."""
    sd = tmp_path / "sess"
    _seed_session(sd, [("l1", "안녕하세요")])
    no_id = [{"line_id": "", "text": "안녕하세요", "status": "ready"}]
    assert _voice_script_mismatch(str(sd), no_id) is not None


# ─────────────────────────────────────────────────────────────
# Fix #1 (백엔드) — 매니페스트가 line_texts 를 line_ids 순서로 반환
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def user_stub():
    class _U:
        id = "testuser0001"
        role = "user"

    return _U()


def test_manifest_returns_line_texts_in_build_order(tmp_path, monkeypatch, user_stub):
    """재열기 dirty 판정의 근거 — line_texts[i] 가 line_ids[i] 의 빌드 당시 원문이어야 한다."""
    sessions_root = tmp_path / "tts_sessions"
    sessions_root.mkdir()
    monkeypatch.setattr(tp, "TTS_SESSIONS_DIR", str(sessions_root))
    session_id = "abcdef012345"
    seed = [("l1", "첫 줄 원문"), ("l2", "둘째 줄 원문"), ("l3", "셋째 줄 원문")]
    _seed_session(sessions_root / session_id, seed)

    res = asyncio.run(tp.get_preview_session(session_id, db=None, _user=user_stub))

    assert res["line_ids"] == ["l1", "l2", "l3"]
    assert res["line_texts"] == ["첫 줄 원문", "둘째 줄 원문", "셋째 줄 원문"]
    # line_ids 와 line_texts 는 같은 순서·길이여야 프론트가 id→원문으로 zip 할 수 있다.
    assert len(res["line_texts"]) == len(res["line_ids"])


def test_manifest_line_texts_none_without_signature(tmp_path, monkeypatch, user_stub):
    """signature 없으면 line_ids/line_texts 모두 None(순서 보장 불가) → 프론트는 전체 재빌드로 안전 폴백."""
    sessions_root = tmp_path / "tts_sessions"
    sessions_root.mkdir()
    monkeypatch.setattr(tp, "TTS_SESSIONS_DIR", str(sessions_root))
    session_id = "abcdef012345"
    sd = sessions_root / session_id
    sd.mkdir(parents=True, exist_ok=True)
    # metadata 만 있고 signature.json 은 없음
    (sd / "metadata.json").write_text(
        json.dumps({"durations": [0.3], "original_sentences": ["x"], "voice_id": "v"}),
        encoding="utf-8",
    )

    res = asyncio.run(tp.get_preview_session(session_id, db=None, _user=user_stub))
    assert res["line_ids"] is None
    assert res["line_texts"] is None
