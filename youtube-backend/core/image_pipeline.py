"""이미지/영상 클립 처리 - Ken Burns 효과 및 AI 클립 후처리"""

import json
import math
import shlex
import subprocess
import sys

from PIL import Image

from core.ffmpeg import FFMPEG_Q, FFPROBE_Q


def apply_ken_burns(
    image_path: str,
    output_path: str,
    motion_type: str,
    duration: float,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
):
    """
    이미지에 Ken Burns 효과(줌/팬)를 적용하여 영상 클립 생성.

    4배 업스케일 후 zoompan 적용 → 줌 시 화질 저하 방지.
    """
    total_frames = int(duration * fps)
    zoom_speed = 0.05 / total_frames  # 전체 5% 줌 (AI 클립 process_ai_clip 과 동일)

    # 업스케일 해상도 (4배) - 비율 유지하며 프레임을 채우도록 스케일링
    up_w = width * 4
    up_h = height * 4
    # 가로/세로 중 프레임을 채우는 쪽에 맞추고, 나머지는 비율 유지
    # -2는 ffmpeg에서 짝수 보장
    scale_expr = (
        f"scale='if(gt(iw/ih,{up_w}/{up_h}),{up_w},-2)'"
        f":'if(gt(iw/ih,{up_w}/{up_h}),-2,{up_h})'"
        f":flags=lanczos"
    )

    filter_map = {
        "zoom_in": (
            f"zoompan=z='min(1+{zoom_speed}*on,1.05)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={total_frames}:s={width}x{height}:fps={fps}"
        ),
        "zoom_out": (
            f"zoompan=z='max(1.05-{zoom_speed}*on,1.0)':"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"d={total_frames}:s={width}x{height}:fps={fps}"
        ),
        "pan_left": (
            f"zoompan=z='1.15':"
            f"x='(iw-iw/zoom)*(1-on/{total_frames})':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d={total_frames}:s={width}x{height}:fps={fps}"
        ),
        "pan_right": (
            f"zoompan=z='1.15':"
            f"x='(iw-iw/zoom)*on/{total_frames}':"
            f"y='ih/2-(ih/zoom/2)':"
            f"d={total_frames}:s={width}x{height}:fps={fps}"
        ),
        "pan_up": (
            f"zoompan=z='1.15':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='(ih-ih/zoom)*(1-on/{total_frames})':"
            f"d={total_frames}:s={width}x{height}:fps={fps}"
        ),
        "pan_down": (
            f"zoompan=z='1.15':"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='(ih-ih/zoom)*on/{total_frames}':"
            f"d={total_frames}:s={width}x{height}:fps={fps}"
        ),
    }

    zoompan_filter = filter_map.get(motion_type, filter_map["zoom_in"])
    vf = f"{scale_expr},{zoompan_filter}"

    cmd = (
        f'{FFMPEG_Q} -y -loop 1 -i "{image_path}" '
        f'-vf "{vf}" '
        f"-t {duration} "
        f"-c:v libx264 -preset fast -crf 18 "
        f"-pix_fmt yuv420p -r {fps} -an "
        f'"{output_path}"'
    )

    if sys.platform == "win32":
        args = cmd
    else:
        args = shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        # 실제 ffmpeg 에러는 stderr 끝부분에 나온다(앞은 버전/설정 배너). 뒤 700자를 보여준다.
        raise RuntimeError(f"Ken Burns 실패: {result.stderr.strip()[-700:]}")

    return output_path


def process_ai_clip(
    clip_path: str,
    output_path: str,
    duration: float,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
    zoom_start: float = 1.0,
    zoom_end: float = 1.05,
):
    """
    AI 생성 영상 클립에 trim + 서서히 줌인 효과 적용.

    - TTS 길이에 맞춰 클립을 잘라냄 (trim)
    - 매 프레임마다 scale을 점진적으로 키우고 중앙 crop (줌인)
    - zoom_start=1.0 → zoom_end=1.05 : 5% 서서히 줌인
    """
    zoom_range = zoom_end - zoom_start

    # 1. 먼저 목표 해상도로 업스케일 (AI 클립은 512x916 등 저해상도)
    # 2. 매 프레임 점진적 확대 (1.0x → 1.05x)
    # 3. 확대된 프레임의 정중앙을 목표 크기로 crop
    vf = (
        f"scale={width}:{height}:flags=lanczos,"
        f"scale=w='iw*({zoom_start}+{zoom_range}*t/{duration})':"
        f"h='ih*({zoom_start}+{zoom_range}*t/{duration})':eval=frame:flags=lanczos,"
        f"crop={width}:{height}:(iw-{width})/2:(ih-{height})/2"
    )

    cmd = (
        f'{FFMPEG_Q} -y -i "{clip_path}" '
        f'-t {duration} '
        f'-vf "{vf}" '
        f"-c:v libx264 -preset fast -crf 18 "
        f"-pix_fmt yuv420p -r {fps} -an "
        f'"{output_path}"'
    )

    if sys.platform == "win32":
        args = cmd
    else:
        args = shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        # 실제 ffmpeg 에러는 stderr 끝부분에 나온다(앞은 버전/설정 배너). 뒤 700자를 보여준다.
        raise RuntimeError(f"AI 클립 처리 실패: {result.stderr.strip()[-700:]}")

    return output_path


# ─────────────────────────────────────────────────────────────────────────
# 카드 B 전용: 사용자 자산 위치/배율(transform) — 왜곡 없이 원본 비율 유지 배치
#
# transform = {"scale": s, "x": x, "y": y}
#   기준(scale=1,x=0,y=0)은 cover-fit(원본이 프레임을 꽉 채우고, 넘치는 쪽은 잘림·중앙 정렬).
#     → 업로드 직후 기본 배치가 곧 "화면 꽉 채움"이라 별도 초기값 계산이 필요 없다.
#     → 9:16 원본(AI 이미지·기존 크롭 이미지)은 cover=identity 라 오늘과 동일하게 렌더된다.
#     scale 을 1 미만으로 낮추면 원본 전체가 보이도록 축소(여백은 검정), 1 초과면 확대.
#   x/y 는 자산 중심이 프레임 중심에서 벗어난 정도를, 프레임 폭/높이 대비 비율로 나타낸다.
#   프리뷰(폭 350px)와 최종 렌더(폭 1080px)가 **동일 수식**을 써서 WYSIWYG 를 보장한다.
#   → 프론트엔드 frontend/src/lib/youtube/transform.ts 의 computePlacement 와 반드시 동일.
#     한쪽 수식을 바꾸면 양쪽을 함께 바꿀 것.
# ─────────────────────────────────────────────────────────────────────────

DEFAULT_TRANSFORM = {"scale": 1.0, "x": 0.0, "y": 0.0}
KEN_BURNS_MOTIONS = {"zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"}
SCALE_MIN = 0.1
SCALE_MAX = 3.0
OFFSET_MAX = 1.5


def _finite(value, fallback: float) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(f):
        return fallback
    return f


def normalize_transform(raw) -> dict:
    """저장/전송된 transform 을 안전한 범위로 보정. None·손상값이면 기본값(cover)."""
    if not isinstance(raw, dict):
        return dict(DEFAULT_TRANSFORM)
    scale = _finite(raw.get("scale"), 1.0)
    x = _finite(raw.get("x"), 0.0)
    y = _finite(raw.get("y"), 0.0)
    scale = min(SCALE_MAX, max(SCALE_MIN, scale))
    x = min(OFFSET_MAX, max(-OFFSET_MAX, x))
    y = min(OFFSET_MAX, max(-OFFSET_MAX, y))
    return {"scale": scale, "x": x, "y": y}


def placement_floats(src_w: int, src_h: int, transform: dict, width: int, height: int):
    """배치 결과를 실수(px)로 반환: (dw, dh, left, top). 프론트와 공유하는 순수 수식.

    base = max(W/sw, H/sh) 는 cover(프레임 꽉 채움) 배율. scale 이 이를 곱한다.
    """
    t = normalize_transform(transform)
    sw = max(1, int(src_w))
    sh = max(1, int(src_h))
    base = max(width / sw, height / sh)
    dw = sw * base * t["scale"]
    dh = sh * base * t["scale"]
    left = width / 2 + t["x"] * width - dw / 2
    top = height / 2 + t["y"] * height - dh / 2
    return dw, dh, left, top


def _even_round(value: float) -> int:
    # floor(v+0.5): JS Math.round 와 동일한 반올림(banker's rounding 회피) 후 짝수화.
    r = math.floor(value + 0.5)
    return r - (r % 2)


def compute_placement(src_w: int, src_h: int, transform: dict, width: int, height: int):
    """렌더용 배치: (DW, DH, OX, OY) 짝수 정수. yuv420p 크로마 정렬 위해 전부 짝수."""
    dw, dh, left, top = placement_floats(src_w, src_h, transform, width, height)
    DW = max(2, _even_round(dw))
    DH = max(2, _even_round(dh))
    OX = _even_round(left)
    OY = _even_round(top)
    return DW, DH, OX, OY


def is_identity_placement(src_w: int, src_h: int, transform: dict, width: int, height: int) -> bool:
    """원본이 이미 프레임 크기(width×height)이고 배치가 꽉 채움 그대로면 합성 불필요."""
    if int(src_w) != int(width) or int(src_h) != int(height):
        return False
    DW, DH, OX, OY = compute_placement(src_w, src_h, transform, width, height)
    return DW == width and DH == height and OX == 0 and OY == 0


def probe_media_dims(filepath: str) -> tuple[int, int]:
    """영상/이미지의 픽셀 크기(가로, 세로)를 ffprobe 로 조회.

    회전 메타데이터(±90/270)가 있으면 가로·세로를 스왑해 ffmpeg 디코드 시 자동 회전
    결과 및 브라우저 naturalWidth/videoWidth 와 일치시킨다(프리뷰=렌더 정합).
    """
    cmd = (
        f'{FFPROBE_Q} -v quiet -print_format json '
        f'-show_streams -select_streams v:0 "{filepath}"'
    )
    if sys.platform == "win32":
        args = cmd
    else:
        args = shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0 or not (result.stdout or "").strip():
        raise RuntimeError(
            f"미디어 크기 조회 실패(returncode={result.returncode}): "
            f"{(result.stderr or '').strip()[-500:]}"
        )
    streams = (json.loads(result.stdout).get("streams") or [])
    if not streams:
        raise RuntimeError("미디어에 영상 스트림이 없습니다")
    st = streams[0]
    w = int(st.get("width") or 0)
    h = int(st.get("height") or 0)
    if w <= 0 or h <= 0:
        raise RuntimeError("미디어 크기를 읽을 수 없습니다")
    rotation = 0.0
    for sd in (st.get("side_data_list") or []):
        if "rotation" in sd:
            rotation = _finite(sd.get("rotation"), 0.0)
            break
    else:
        tags = st.get("tags") or {}
        rotation = _finite(tags.get("rotate"), 0.0)
    if int(abs(rotation)) % 180 == 90:
        w, h = h, w
    return w, h


def compose_image_canvas(
    image_path: str,
    output_path: str,
    transform: dict,
    width: int = 1080,
    height: int = 1920,
) -> str:
    """이미지를 transform 대로 검정 1080×1920 캔버스에 비율 유지 배치(합성).

    PIL 로 처리해 win32 filter 인용 문제를 피하고, 원본 해상도에서 바로 LANCZOS 리샘플한다.
    paste 는 음수/프레임 밖 좌표를 자동으로 잘라내므로 = 오버플로 크롭(의도된 동작).
    """
    with Image.open(image_path) as im:
        src = im.convert("RGB")
        DW, DH, OX, OY = compute_placement(src.width, src.height, transform, width, height)
        fg = src.resize((DW, DH), Image.LANCZOS)
    canvas = Image.new("RGB", (width, height), (0, 0, 0))
    canvas.paste(fg, (OX, OY))
    canvas.save(output_path, "PNG")
    return output_path


def prepare_image_canvas(
    image_path: str,
    output_path: str,
    transform: dict,
    width: int = 1080,
    height: int = 1920,
) -> str:
    """배치가 꽉 채움 그대로(원본이 이미 프레임 크기)면 원본 경로를 반환(합성 생략),
    아니면 compose_image_canvas 로 합성 후 output_path 반환.

    → AI/기존에 1080×1920 로 저장된 이미지는 합성을 건너뛰어 오늘과 동일 경로를 탄다.
    """
    with Image.open(image_path) as im:
        sw, sh = im.width, im.height
    if is_identity_placement(sw, sh, transform, width, height):
        return image_path
    return compose_image_canvas(image_path, output_path, transform, width, height)


def render_still_clip(
    image_path: str,
    output_path: str,
    duration: float,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
) -> str:
    """이미 프레임 크기(width×height)인 정지 이미지를 모션 없는 클립으로 인코딩."""
    cmd = (
        f'{FFMPEG_Q} -y -loop 1 -i "{image_path}" '
        f'-t {duration} '
        f'-vf "format=yuv420p" '
        f"-c:v libx264 -preset fast -crf 18 "
        f"-pix_fmt yuv420p -r {fps} -an "
        f'"{output_path}"'
    )
    if sys.platform == "win32":
        args = cmd
    else:
        args = shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(f"정지 클립 생성 실패: {result.stderr.strip()[-700:]}")
    return output_path


def process_user_clip(
    clip_path: str,
    output_path: str,
    duration: float,
    transform: dict,
    src_w: int,
    src_h: int,
    motion: str = "none",
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
    start: float = 0.0,
) -> str:
    """사용자 업로드 영상: 원본 비율 유지한 채 transform 대로 검정 캔버스에 배치 + trim.

    - 왜곡 없음: scale 로 비율 유지 리사이즈 후 overlay(음수 좌표·오버플로 크롭 허용).
    - motion="zoom_in" 이면 합성 프레임(9:16)에 기존과 동일한 5% 서서히 줌인을 적용.
    - setsar=1 로 휴대폰 영상의 앵글드 SAR(비정방 픽셀) 왜곡을 무력화.
    - start>0 이면 `-ss` 를 `-i` 앞에 둬 그 지점부터 사용(선트림 조각의 앞 여유분 건너뛰기).
      입력 시킹이라 출력 타임스탬프가 0 부터 재시작 → zoom_in 의 t/{duration} 수식이 그대로 유효.
      start=0.0(레거시)이면 기존과 완전히 동일한 명령.
    """
    DW, DH, OX, OY = compute_placement(src_w, src_h, transform, width, height)

    # setpts=PTS-STARTPTS: `-ss` 입력 시킹(start>0) 시 영상 첫 프레임의 PTS 가 정확히 0 이 아니라,
    # 검정 배경(bg, PTS 0)에 overlay 하면 t=0 순간 배경만 보여 첫 프레임이 검정으로 깜빡인다.
    # 타임스탬프를 0 으로 리셋해 fg 가 bg 와 t=0 부터 정렬되게 한다(start=0 이면 무해한 no-op).
    place = (
        f"color=c=black:s={width}x{height}:r={fps}:d={duration}[bg];"
        f"[0:v]scale={DW}:{DH}:flags=lanczos,setsar=1,setpts=PTS-STARTPTS[fg];"
        f"[bg][fg]overlay={OX}:{OY}:shortest=1"
    )
    if motion == "zoom_in":
        # process_ai_clip 과 동일한 점진 확대(1.0→1.05) — 입력이 이미 9:16 이라 왜곡 없음.
        vf = (
            f"{place}[comp];"
            f"[comp]scale=w='iw*(1.0+0.05*t/{duration})':"
            f"h='ih*(1.0+0.05*t/{duration})':eval=frame:flags=lanczos,"
            f"crop={width}:{height}:(iw-{width})/2:(ih-{height})/2,format=yuv420p[v]"
        )
    else:
        vf = f"{place},format=yuv420p[v]"

    seek = f"-ss {start:.3f} " if start and start > 0 else ""
    cmd = (
        f'{FFMPEG_Q} -y {seek}-i "{clip_path}" '
        f'-t {duration} '
        f'-filter_complex "{vf}" -map "[v]" '
        f"-c:v libx264 -preset fast -crf 18 "
        f"-pix_fmt yuv420p -r {fps} -an "
        f'"{output_path}"'
    )
    if sys.platform == "win32":
        args = cmd
    else:
        args = shlex.split(cmd)
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(f"영상 배치 처리 실패: {result.stderr.strip()[-700:]}")
    return output_path
