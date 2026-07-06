"""이미지 기반 YouTube Shorts 영상 조립 파이프라인"""

import asyncio
import subprocess
import json
import os

from core.audio_utils import (
    run,
    speed_up_sentences,
    build_aligned_narration,
)
from core.subtitle_utils import split_subtitle_natural, split_title
from core.tts_engines import generate_tts_typecast
from core.image_pipeline import apply_ken_burns, process_ai_clip
from core.ffmpeg import FFMPEG_Q, FFPROBE_Q
from config import settings


def get_duration(filepath):
    """ffprobe로 미디어 길이 조회"""
    probe = subprocess.run(
        f'{FFPROBE_Q} -v quiet -print_format json -show_format "{filepath}"',
        shell=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if probe.returncode != 0 or not (probe.stdout or "").strip():
        raise RuntimeError(
            f"ffprobe 길이 조회 실패(returncode={probe.returncode}): "
            f"{(probe.stderr or '')[-500:]}"
        )
    return float(json.loads(probe.stdout)["format"]["duration"])


def calculate_dynamic_clips_image(sentence_durations, buffer=0.0):
    """이미지 기반 클립 길이 계산 (소스 영상 제약 없음)"""
    clip_durations = []
    clip_starts = []
    t = 0.0
    for dur in sentence_durations:
        actual_dur = dur + buffer
        clip_durations.append(round(actual_dur, 2))
        clip_starts.append(round(t, 2))
        t += actual_dur
    return clip_durations, clip_starts, round(t, 2)


async def assemble_shorts(job_id: str, config: dict, progress_callback=None):
    """
    메인 파이프라인: 이미지 + TTS → 최종 9:16 쇼츠 영상.

    config 키:
        job_dir, images, lines, title,
        tts_engine, tts_speed, bgm_path, bgm_volume,
        font_title, font_sub
    """
    job_dir = config["job_dir"]
    temp_dir = os.path.join(job_dir, "temp")
    tts_dir = os.path.join(job_dir, "tts")
    output_dir = os.path.join(job_dir, "output")

    sentences = [line["text"] for line in config["lines"]]
    images = config["images"]
    motions = [line["motion"] for line in config["lines"]]

    # ── Step 1: TTS 준비 ──
    # prebuilt_tts=True면 tts_dir에 이미 sent_XX.wav + timings_raw.json 있다고 가정.
    # 그 외엔 Typecast API 호출해 신규 생성.
    prebuilt_tts = config.get("prebuilt_tts", False)
    tts_speed = config.get("tts_speed", 1.1)
    voice_id = config.get("voice_id")
    emotion = config.get("emotion")

    if prebuilt_tts:
        _update(progress_callback, job_id, "generating_tts", 0.4, "사전 생성된 TTS 사용")
        timings_path = os.path.join(tts_dir, "timings_raw.json")
        if not os.path.exists(timings_path):
            raise RuntimeError(f"prebuilt_tts 활성인데 timings_raw.json 없음: {timings_path}")
    else:
        _update(progress_callback, job_id, "generating_tts", 0.4, "TTS 나레이션 생성 중...")
        tc_api_key = config.get("typecast_api_key")
        await generate_tts_typecast(
            tts_dir, sentences, voice_id=voice_id, speed=tts_speed, emotion=emotion, api_key=tc_api_key
        )

    sentence_durations = [
        t["duration"] for t in json.loads(
            open(os.path.join(tts_dir, "timings_raw.json"), encoding="utf-8").read()
        )
    ]
    clip_durations, clip_starts, total_dur = calculate_dynamic_clips_image(
        sentence_durations
    )
    # Typecast API가 이미 속도를 처리하므로 1.0으로 호출 → _fast.wav 파일 생성
    await asyncio.to_thread(
        speed_up_sentences, tts_dir, sentences, tts_speed=1.0
    )
    narration_path, timings = await asyncio.to_thread(
        build_aligned_narration, tts_dir, sentences, clip_starts, total_dur
    )

    # ── Step 2: 영상 클립 생성 (카드 B 줄별 매니페스트 / Ken Burns / AI 클립 trim+zoom) ──
    video_mode = config.get("video_mode", "kenburns")
    ai_clips = config.get("ai_clips")
    line_sources = config.get("line_sources")
    asset_paths = config.get("asset_paths")

    clip_files = []
    N = len(config["lines"])

    if line_sources and asset_paths and len(line_sources) == N and len(asset_paths) == N:
        # 카드 B: 줄별 자산 매니페스트로 분기 처리
        _update(
            progress_callback, job_id, "assembling_video", 0.55, "줄별 자산 처리 중..."
        )
        for i in range(N):
            src = line_sources[i]
            asset = asset_paths[i]
            motion = motions[i] if i < len(motions) else "zoom_in"
            dur = clip_durations[i]
            clip_path = os.path.join(temp_dir, f"clip_{i:02d}.mp4")

            if src == "clip":
                # 사용자 업로드 영상: 길이 검증 후 trim+zoom 처리
                v_dur = await asyncio.to_thread(get_duration, asset)
                if v_dur + 0.05 < dur:
                    raise RuntimeError(
                        f"{i + 1}번째 줄 영상이 음성보다 짧습니다 "
                        f"(영상 {v_dur:.2f}초 < 음성 {dur:.2f}초). "
                        f"더 긴 영상으로 교체해주세요."
                    )
                await asyncio.to_thread(
                    process_ai_clip,
                    clip_path=asset,
                    output_path=clip_path,
                    duration=dur,
                    width=settings.TARGET_WIDTH,
                    height=settings.TARGET_HEIGHT,
                    fps=settings.FPS,
                )
            else:
                # "ai" 또는 "image": 이미지에 Ken Burns 적용
                await asyncio.to_thread(
                    apply_ken_burns,
                    image_path=asset,
                    output_path=clip_path,
                    motion_type=motion,
                    duration=dur,
                    width=settings.TARGET_WIDTH,
                    height=settings.TARGET_HEIGHT,
                    fps=settings.FPS,
                )
            clip_files.append(clip_path)
            _update(
                progress_callback,
                job_id,
                "assembling_video",
                0.55 + (i + 1) / N * 0.15,
                f"줄별 자산 처리 ({i + 1}/{N})",
            )
    elif video_mode in ("hailuo", "hailuo23", "wan", "kling", "veo", "veo_lite") and ai_clips and len(ai_clips) == len(images):
        # AI 영상 모드: AI 클립에 trim + 서서히 줌인 적용
        _update(
            progress_callback, job_id, "assembling_video", 0.55, "AI 클립 trim + 줌인 적용 중..."
        )
        for i, (raw_clip, dur) in enumerate(zip(ai_clips, clip_durations)):
            clip_path = os.path.join(temp_dir, f"clip_{i:02d}.mp4")
            await asyncio.to_thread(
                process_ai_clip,
                clip_path=raw_clip,
                output_path=clip_path,
                duration=dur,
                width=settings.TARGET_WIDTH,
                height=settings.TARGET_HEIGHT,
                fps=settings.FPS,
            )
            clip_files.append(clip_path)
            _update(
                progress_callback,
                job_id,
                "assembling_video",
                0.55 + (i + 1) / len(images) * 0.15,
                f"AI 클립 처리 ({i + 1}/{len(images)})",
            )
    else:
        # Ken Burns 모드: 이미지에 줌/팬 효과 적용
        _update(
            progress_callback, job_id, "assembling_video", 0.55, "Ken Burns 모션 적용 중..."
        )
        for i, (img_path, motion, dur) in enumerate(zip(images, motions, clip_durations)):
            clip_path = os.path.join(temp_dir, f"clip_{i:02d}.mp4")
            await asyncio.to_thread(
                apply_ken_burns,
                image_path=img_path,
                output_path=clip_path,
                motion_type=motion,
                duration=dur,
                width=settings.TARGET_WIDTH,
                height=settings.TARGET_HEIGHT,
                fps=settings.FPS,
            )
            clip_files.append(clip_path)
            _update(
                progress_callback,
                job_id,
                "assembling_video",
                0.55 + (i + 1) / len(images) * 0.15,
                f"Ken Burns 적용 ({i + 1}/{len(images)})",
            )

    # ── Step 3: 클립 연결 ──
    _update(progress_callback, job_id, "assembling_video", 0.72, "클립 연결 중...")

    concat_list = os.path.join(temp_dir, "concat_list.txt")
    # 윈도우 한글 계정 경로(C:\Users\한글이름\...) 대응:
    # 목록 파일에 한글 절대경로를 적으면 cp949로 저장돼, UTF-8을 기대하는 ffmpeg
    # concat demuxer가 경로를 못 찾아 실패한다. clip_files는 전부 temp_dir 안의
    # clip_NN.mp4 이고 concat demuxer는 상대경로를 "목록 파일이 있는 폴더" 기준으로
    # 해석하므로, 파일명만 적고 UTF-8로 저장하면 한글 경로가 파일에서 사라진다.
    # (파일명은 코드가 만든 clip_NN.mp4 라 따옴표 escaping 불필요)
    with open(concat_list, "w", encoding="utf-8") as f:
        for clip in clip_files:
            f.write(f"file '{os.path.basename(clip)}'\n")

    concat_out = os.path.join(temp_dir, "concat_raw.mp4")
    await asyncio.to_thread(
        run,
        f'{FFMPEG_Q} -y -f concat -safe 0 -i "{concat_list}" '
        f'-c:v libx264 -preset fast -crf 18 "{concat_out}"',
    )

    # ── Step 4: 오디오 믹싱 ──
    _update(progress_callback, job_id, "assembling_video", 0.80, "오디오 믹싱 중...")

    audio_out = os.path.join(temp_dir, "mixed_audio.mp4")
    vid_duration = await asyncio.to_thread(get_duration, concat_out)

    bgm_path = config.get("bgm_path")
    bgm_vol = config.get("bgm_volume", 0.12)
    bgm_start = config.get("bgm_start_sec", 0.0)
    has_bgm = bgm_path and os.path.exists(bgm_path)

    if has_bgm:
        await asyncio.to_thread(
            run,
            f'{FFMPEG_Q} -y -i "{concat_out}" -i "{narration_path}" -i "{bgm_path}" '
            f'-filter_complex "'
            f"[1:a]volume=1.0[narr];"
            f"[2:a]atrim={bgm_start}:{bgm_start + vid_duration},asetpts=PTS-STARTPTS,volume={bgm_vol}[bgm];"
            f'[narr][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]'
            f'" '
            f'-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k '
            f'-shortest "{audio_out}"',
        )
    else:
        await asyncio.to_thread(
            run,
            f'{FFMPEG_Q} -y -i "{concat_out}" -i "{narration_path}" '
            f"-map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k "
            f'-shortest "{audio_out}"',
        )

    # ── Step 4.5: 오디오 라우드니스 노멀라이즈 (-14 LUFS, YouTube 기준) ──
    _update(progress_callback, job_id, "assembling_video", 0.85, "오디오 노멀라이즈 중...")

    normalized_out = os.path.join(temp_dir, "normalized.mp4")
    await asyncio.to_thread(
        run,
        f'{FFMPEG_Q} -y -i "{audio_out}" '
        f'-af loudnorm=I=-14:LRA=11:TP=-1.0 '
        f'-c:v copy -c:a aac -b:a 192k '
        f'"{normalized_out}"',
    )
    audio_out = normalized_out

    # ── Step 5: 자막 + 타이틀 오버레이 ──
    _update(progress_callback, job_id, "assembling_video", 0.90, "자막/타이틀 합성 중...")

    subtitles = split_subtitle_natural(timings)
    font_title = config.get("font_title", settings.FONT_TITLE)
    font_sub = config.get("font_sub", settings.FONT_SUB)
    title_text = config.get("title", "")
    title_color = "#00CED1"
    sq = settings.TARGET_WIDTH  # 1080
    h = settings.TARGET_HEIGHT  # 1920
    sq_y = (h - sq) // 2  # 420

    sub_y = sq_y + sq - 200

    def _escape_filter(text):
        # ffmpeg drawtext text= 옵션에서 특수 해석되는 문자들 이스케이프.
        # %는 %{function} 변수 치환의 시작 문자라 자막에 포함되면 그 자막 전체가
        # 렌더링 실패한다. 백슬래시로 이스케이프 + drawtext에 expansion=none도 병행.
        return (
            text.replace("'", "'\\''")
                .replace(",", "\\,")
                .replace(":", "\\:")
                .replace("%", "\\%")
        )

    # drawtext 의 fontfile 은 "파일명만" 으로 넘기고, ffmpeg 를 폰트 폴더(cwd)에서 실행한다.
    # 윈도우 절대경로(C:\...\font.otf)를 필터에 직접 넣으면 드라이브 콜론·역슬래시가 ffmpeg
    # 필터 파서에서 깨져 폰트 로드 실패 → fontconfig 폴백 → 윈도우엔 fontconfig 설정이 없어
    # 필터 초기화 실패가 난다(0.3.1 윈도우 자막 버그). 파일명만 쓰면 특수문자가 없어 맥/윈도우
    # 동일하게 안전하다. (동봉 폰트는 모두 같은 fonts/ 폴더에 있으므로 cwd 하나로 충분)
    font_dir = os.path.dirname(font_sub or font_title) or "."
    font_sub_name = os.path.basename(font_sub) if font_sub else ""
    font_title_name = os.path.basename(font_title) if font_title else ""

    sub_filters = []
    for start, end, text in subtitles:
        escaped = _escape_filter(text)
        sub_filters.append(
            f"drawtext=expansion=none:fontfile='{font_sub_name}':text='{escaped}':"
            f"fontsize=55:fontcolor=white:borderw=3:bordercolor=black:"
            f"x=(w-text_w)/2:y={sub_y}:"
            f"enable='between(t,{start},{end})'"
        )

    title_filters = []
    if title_text and font_title:
        tl1 = config.get("title_line1")
        tl2 = config.get("title_line2")
        if tl1:
            title_lines = [tl1, tl2] if tl2 else [tl1]
        else:
            title_lines = split_title(title_text, max_chars=8)
        # 사용자가 고른 제목 크기(px, 1080폭 기준). 기본 120. 테두리·그림자·줄간격은
        # 120 기준값에 비례 스케일해 극단 크기에서도 균형 유지.
        title_fontsize = max(70, min(170, int(config.get("title_font_size") or 120)))
        _sf = title_fontsize / 120
        title_line_gap = round(130 * _sf)
        shadow_off = max(1, round(6 * _sf))
        border_w = max(1, round(4 * _sf))
        # 윗줄/아랫줄 색. 사용자 입력이 여기서 drawtext fontcolor 로 박히므로 normalize_hex 로
        # 2차 방어(#RRGGBB 아니면 기본색). 기본: 윗줄 흰색, 아랫줄 톤다운 노란색.
        from core.colors import normalize_hex, DEFAULT_TITLE_COLOR1, DEFAULT_TITLE_COLOR2
        title_colors = [
            normalize_hex(config.get("title_color1"), DEFAULT_TITLE_COLOR1),
            normalize_hex(config.get("title_color2"), DEFAULT_TITLE_COLOR2),
        ]
        font_path_escaped = font_title_name
        for j, line in enumerate(title_lines):
            escaped = _escape_filter(line)
            if len(title_lines) == 1:
                ty = sq_y - title_fontsize - 30
            else:
                base_y = sq_y - (len(title_lines) * title_line_gap) - 10
                ty = base_y + (j * title_line_gap)
            line_color = title_colors[min(j, len(title_colors) - 1)]
            # 그림자 레이어 (검정, 살짝 오프셋)
            title_filters.append(
                f"drawtext=expansion=none:fontfile='{font_path_escaped}':text='{escaped}':"
                f"fontsize={title_fontsize}:fontcolor=black@0.5:"
                f"x=(w-text_w)/2+{shadow_off}:y={ty}+{shadow_off}"
            )
            # 본문 레이어 (테두리 + 색상)
            title_filters.append(
                f"drawtext=expansion=none:fontfile='{font_path_escaped}':text='{escaped}':"
                f"fontsize={title_fontsize}:fontcolor={line_color}:"
                f"borderw={border_w}:bordercolor=black@0.8:"
                f"x=(w-text_w)/2:y={ty}"
            )

    all_filters = title_filters + sub_filters
    output_path = os.path.join(output_dir, "shorts_final.mp4")
    # 재제작 시 기존 완성본을 ffmpeg가 직접 덮어쓰면, 중간에 실패할 경우
    # 작업이력의 영상이 손상될 수 있다. tmp 파일로 렌더한 뒤 atomic replace.
    tmp_output = os.path.join(output_dir, "shorts_final.tmp.mp4")
    # 이전 빌드의 tmp가 남아 있을 수 있으므로 제거
    if os.path.exists(tmp_output):
        try:
            os.remove(tmp_output)
        except Exception:
            pass

    try:
        if all_filters:
            # Windows에서 인라인 -vf는 경로/한글 이스케이핑 문제가 있으므로 필터그래프를
            # 파일로 전달한다. 과거엔 -filter_script:v 를 썼으나, 번들 win64 ffmpeg(BtbN master)가
            # 이 옵션을 제거해 "Unrecognized option 'filter_script:v'" 로 영상생성이 깨졌다(0.3.6-rc1).
            # 동일 기능의 신형 문법 -/filter:v <파일>(ffmpeg 7.1+, "옵션 값을 파일에서 읽기")로 교체.
            # 맥 8.x·윈도우 master·dev 모두 지원하며, drawtext 출력이 -filter_script:v 와 바이트 단위로
            # 동일함을 검증함.
            filter_str = ",".join(all_filters)
            filter_script = os.path.join(temp_dir, "subtitle_filter.txt")
            with open(filter_script, "w", encoding="utf-8") as f:
                f.write(filter_str)
            await asyncio.to_thread(
                run,
                f'{FFMPEG_Q} -y -i "{audio_out}" '
                f'-/filter:v "{filter_script}" '
                f'-c:v libx264 -preset fast -crf 18 -c:a copy "{tmp_output}"',
                cwd=font_dir,
            )
        else:
            await asyncio.to_thread(
                run,
                f'{FFMPEG_Q} -y -i "{audio_out}" -c copy "{tmp_output}"',
            )

        if not os.path.exists(tmp_output) or os.path.getsize(tmp_output) == 0:
            raise RuntimeError("최종 영상 출력이 비어 있습니다")

        # 성공 시에만 final 위치로 atomic replace
        os.replace(tmp_output, output_path)
    finally:
        # 실패 시 tmp 정리
        if os.path.exists(tmp_output):
            try:
                os.remove(tmp_output)
            except Exception:
                pass

    # ── 완료 ──
    _update(progress_callback, job_id, "completed", 1.0, "완료!")
    return output_path


def _update(callback, job_id, status, progress, step):
    if callback:
        callback(job_id=job_id, status=status, progress=progress, step=step)
