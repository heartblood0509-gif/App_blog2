"""카드 B 자산 배치(transform) 수식 단위 테스트.

핵심: 프리뷰(프론트)와 최종 렌더(백엔드)가 동일 수식을 써야 WYSIWYG 가 보장된다.
아래 PLACEMENT_CASES 는 frontend/src/lib/youtube/__tests__/transform.test.ts 의
동일 테이블과 **글자 그대로 같은 값**이어야 한다(한쪽을 고치면 양쪽을 고칠 것).

기준(scale=1,x=0,y=0)은 cover-fit: base = max(W/sw, H/sh).
"""

import math

import pytest

from core.image_pipeline import (
    DEFAULT_TRANSFORM,
    SCALE_MIN,
    SCALE_MAX,
    OFFSET_MAX,
    normalize_transform,
    placement_floats,
    compute_placement,
    is_identity_placement,
)

W, H = 1080, 1920

# 프론트 vitest 와 공유하는 배치 수치 테이블 (cover 기준). (dw, dh, left, top) 실수 기대값.
PLACEMENT_CASES = [
    # name, sw, sh, transform, expected (dw, dh, left, top)
    ("landscape_16_9_cover", 1920, 1080, {"scale": 1, "x": 0, "y": 0},
     (3413.3333, 1920.0, -1166.6667, 0.0)),
    ("portrait_9_16_identity", 1080, 1920, {"scale": 1, "x": 0, "y": 0},
     (1080.0, 1920.0, 0.0, 0.0)),
    ("portrait_9_16_half", 1080, 1920, {"scale": 0.5, "x": 0, "y": 0},
     (540.0, 960.0, 270.0, 480.0)),
    ("portrait_3_4", 1200, 1600, {"scale": 1, "x": 0, "y": 0},
     (1440.0, 1920.0, -180.0, 0.0)),
    ("landscape_offset", 1920, 1080, {"scale": 1, "x": 0.25, "y": -0.1},
     (3413.3333, 1920.0, -896.6667, -192.0)),
    ("square_cover", 1000, 1000, {"scale": 1, "x": 0, "y": 0},
     (1920.0, 1920.0, -420.0, 0.0)),
]


@pytest.mark.parametrize("name,sw,sh,t,expected", PLACEMENT_CASES)
def test_placement_floats_match_shared_table(name, sw, sh, t, expected):
    dw, dh, left, top = placement_floats(sw, sh, t, W, H)
    for got, exp, label in zip((dw, dh, left, top), expected, ("dw", "dh", "left", "top")):
        assert got == pytest.approx(exp, abs=1e-3), f"{name}.{label}: {got} != {exp}"


def test_normalize_defaults_on_none_and_garbage():
    assert normalize_transform(None) == DEFAULT_TRANSFORM
    assert normalize_transform("nope") == DEFAULT_TRANSFORM
    assert normalize_transform({}) == DEFAULT_TRANSFORM


def test_normalize_clamps_scale_and_offsets():
    t = normalize_transform({"scale": 99, "x": 5, "y": -5})
    assert t["scale"] == SCALE_MAX
    assert t["x"] == OFFSET_MAX
    assert t["y"] == -OFFSET_MAX
    t2 = normalize_transform({"scale": 0.001, "x": 0.3, "y": 0.4})
    assert t2["scale"] == SCALE_MIN
    assert t2["x"] == pytest.approx(0.3)
    assert t2["y"] == pytest.approx(0.4)


def test_normalize_handles_non_finite():
    t = normalize_transform({"scale": float("nan"), "x": float("inf"), "y": None})
    assert t == DEFAULT_TRANSFORM


def test_compute_placement_even_ints():
    for name, sw, sh, tr, _ in PLACEMENT_CASES:
        DW, DH, OX, OY = compute_placement(sw, sh, tr, W, H)
        for v in (DW, DH, OX, OY):
            assert v % 2 == 0, f"{name}: {v} not even"
        assert DW >= 2 and DH >= 2


def test_identity_for_9_16_default():
    # AI 이미지·기존 크롭 이미지(1080×1920)는 cover 기본에서 합성 불필요(오늘과 동일 렌더).
    assert is_identity_placement(1080, 1920, DEFAULT_TRANSFORM, W, H) is True
    assert is_identity_placement(1080, 1920, {"scale": 1.2, "x": 0, "y": 0}, W, H) is False
    # 크기가 다른 원본은 무조건 합성 필요.
    assert is_identity_placement(1920, 1080, DEFAULT_TRANSFORM, W, H) is False


def test_cover_fills_frame_for_landscape():
    # 16:9 원본은 cover 시 세로를 꽉 채우고(1920) 가로가 넘친다(>1080).
    dw, dh, _, _ = placement_floats(1920, 1080, DEFAULT_TRANSFORM, W, H)
    assert dh == pytest.approx(1920.0)
    assert dw > W
