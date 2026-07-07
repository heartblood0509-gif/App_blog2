"""자막 분리 유틸리티 (build_shorts.py에서 복사)"""

import re


def split_title(text, max_chars=8):
    """타이틀 2줄 분리 — 균형 잡힌 분할 (단어 순서 보장)"""
    if len(text) <= max_chars:
        return [text]
    words = text.split(" ")
    if len(words) <= 1:
        mid = len(text) // 2
        return [text[:mid], text[mid:]]

    best_split = 1
    best_diff = float("inf")
    for i in range(1, len(words)):
        l1 = " ".join(words[:i])
        l2 = " ".join(words[i:])
        diff = abs(len(l1) - len(l2))
        if diff < best_diff:
            best_diff = diff
            best_split = i

    return [" ".join(words[:best_split]), " ".join(words[best_split:])]


MAX_DISPLAY = 12  # 자막 한 조각 최대 표시 폭(구두점 제외). 프론트 subtitle-split.ts 와 동일해야 함.


def display_len(text):
    """구두점을 제외한 '눈에 보이는' 길이. 9:16 좁은 화면 폭 판정 기준."""
    return len(re.sub(r'[?,!.~…·\'""]', "", text))


def natural_split(text):
    """한국어 구문 단위 자동 분할 (쉼표 → 균형 어절 → 탐욕 어절, 최대 12자).

    ⚠️ 프론트엔드 subtitle-split.ts 의 natural_split 과 바이트 단위로 동일해야 한다
    (미리보기 = 최종 영상 보장). 로직 변경 시 양쪽 + 유닛 테스트를 함께 고칠 것.
    """
    if display_len(text) <= MAX_DISPLAY:
        return [text]
    comma_idx = text.find(",")
    if comma_idx > 0:
        p1 = text[: comma_idx + 1].strip()
        p2 = text[comma_idx + 1 :].strip()
        if p2:
            return natural_split(p1) + natural_split(p2)
    words = text.split(" ")
    if len(words) <= 1:
        return [text]
    best = None
    best_score = float("inf")
    for i in range(1, len(words)):
        p1 = " ".join(words[:i])
        p2 = " ".join(words[i:])
        l1, l2 = display_len(p1), display_len(p2)
        if l1 <= MAX_DISPLAY and l2 <= MAX_DISPLAY:
            score = abs(l1 - l2)
            if score < best_score:
                best_score = score
                best = (p1, p2)
    if best:
        return [best[0], best[1]]
    chunks = []
    current = ""
    for word in words:
        test = (current + " " + word).strip() if current else word
        if display_len(test) <= MAX_DISPLAY:
            current = test
        else:
            if current:
                chunks.append(current)
            current = word
    if current:
        chunks.append(current)
    return chunks


# 자막에는 마침표를 넣지 않는다(동영상 자막 관례). 상단 대본 입력란(원문)은 그대로 두고,
# 화면에 그려지는 자막 조각에서만 마침표를 뺀다. 소수점(숫자.숫자, 예: "3.5")은 보존한다.
# ⚠️ 프론트 subtitle-split.ts 의 stripSubtitlePeriods 와 규칙이 동일해야 한다(미리보기=최종 영상).
_SUB_PERIOD_RE = re.compile(r"(?<!\d)\.|\.(?!\d)")


def strip_subtitle_periods(text):
    """자막 표시용: 마침표 제거(소수점은 보존). 원문 텍스트·TTS 타이밍에는 영향 없음."""
    return _SUB_PERIOD_RE.sub("", text)


def _norm_joined(s):
    """공백 제거 + 끝 마침표 제거(카드 A 자동분할이 text.rstrip('.') 하는 것과 정합)."""
    return re.sub(r"\s+", "", s).rstrip(".")


def word_times_match(chunks, word_times):
    """chunks(어절 묶음)와 word_times(어절별 {text,start,end})가 정합하는지.

    조건: 공백/끝마침표 제거 후 문자열 일치 + start 단조증가.
    어절 수 일치는 요구하지 않는다 — 자막 전용 띄어쓰기(발화 한 어절이 자막에선
    여러 어절)를 허용. 어긋나면 False → 호출부가 비례 폴백.
    (프론트 subtitle-split.ts 와 동일 규칙)
    """
    if not word_times or not isinstance(word_times, list):
        return False
    try:
        b = _norm_joined("".join(str(t["text"]) for t in word_times))
        starts = [float(t["start"]) for t in word_times]
    except (KeyError, TypeError, ValueError):
        return False
    if _norm_joined("".join(chunks)) != b:
        return False
    if any(starts[i] > starts[i + 1] + 1e-6 for i in range(len(starts) - 1)):
        return False
    return True


def _strip_space(s):
    return re.sub(r"\s+", "", s)


def _word_chunk_segments(chunks, word_times, start, end):
    """word_times 로 조각별 (seg_start, seg_end) 절대시각 계산. 정합 안 되면 None.

    경계는 공백을 뺀 글자 누적 위치로 발화 어절에 매핑한다:
      · 어절 시작에 떨어지면 그 어절의 start (pause 동안 이전 자막 유지 — 기존 규칙)
      · 어절 '안'에 떨어지면(자막 전용 띄어쓰기로 발화 어절을 쪼갠 경우) 글자 비율로 보간
    첫 조각은 줄 시작(offset)부터, 마지막 조각은 줄 끝까지.
    """
    if not word_times_match(chunks, word_times):
        return None
    lens = [len(_strip_space(str(t["text"]))) for t in word_times]
    start_char = []
    acc = 0
    for length in lens:
        start_char.append(acc)
        acc += length
    segs = []
    seg_start = start
    p = 0  # 다음 조각 첫 글자의 누적 위치(공백 제거 기준)
    n = len(chunks)
    for i, chunk in enumerate(chunks):
        p += len(_strip_space(chunk))
        if i == n - 1:
            seg_end = end
        else:
            j = 0
            while j + 1 < len(start_char) and start_char[j + 1] <= p:
                j += 1
            w = word_times[j]
            if p == start_char[j] or lens[j] <= 0:
                rel = float(w["start"])
            else:
                frac = (p - start_char[j]) / lens[j]
                rel = float(w["start"]) + (float(w["end"]) - float(w["start"])) * frac
            seg_end = start + rel
        seg_end = min(max(seg_end, seg_start), end)  # [seg_start, end] 클램프 + 단조 보정
        segs.append((seg_start, seg_end))
        seg_start = seg_end
    return segs


def split_subtitle_natural(timings, line_chunks=None, line_word_times=None):
    """TTS 타이밍 → 자막 (start, end, text) 목록.

    line_chunks: timings 와 1:1 정렬된 목록(선택). 각 원소는
      · None/빈값  → 자동 분할(natural_split) — 카드 A·레거시 폴백
      · list[str]  → 사용자가 화면·소리에서 확정한 조각을 **그대로** 사용(카드 B).
        영상 조립이 자막을 다시 끊지 않고, 사용자가 미리보기에서 본 대로 박는다.

    line_word_times: timings 와 1:1(선택). 줄별 어절 타임스탬프가 있으면 조각 전환 시각을
      실제 발화(어절 start)에 맞춘다 → 자막-음성 일치. 없거나 정합 안 되면 표시 길이 비례 폴백.
    """
    subs = []
    for idx, t in enumerate(timings):
        start = t["offset"]
        end = t["end"]
        duration = end - start

        chunks = None
        if line_chunks and idx < len(line_chunks):
            provided = line_chunks[idx]
            if provided:
                chunks = [c for c in provided if c and c.strip()]
        if not chunks:
            chunks = natural_split(t["text"].rstrip("."))
        if not chunks:
            continue

        wt = line_word_times[idx] if line_word_times and idx < len(line_word_times) else None
        segs = _word_chunk_segments(chunks, wt, start, end) if wt else None

        if segs is None:
            # 폴백: 표시 길이 비례 배분
            weights = [max(1, display_len(c)) for c in chunks]
            total_w = sum(weights)
            cum = 0
            segs = []
            for i in range(len(chunks)):
                seg_start = start + duration * (cum / total_w)
                cum += weights[i]
                seg_end = end if i == len(chunks) - 1 else start + duration * (cum / total_w)
                segs.append((seg_start, seg_end))

        # 타이밍 정렬은 원본 조각(마침표 포함, word_times 와 글자수 정합)으로 끝냈고,
        # 화면에 그려지는 자막 문자열에서만 마침표를 뺀다.
        for (seg_start, seg_end), chunk in zip(segs, chunks):
            subs.append((round(seg_start, 2), round(seg_end, 2), strip_subtitle_periods(chunk)))
    return subs
