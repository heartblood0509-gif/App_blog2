"""
네이버 블로그 자동 포스팅 봇
App_blog_auto3의 검증된 발행 로직을 기반으로 구현.
Playwright를 사용하여 SmartEditor ONE에 글을 작성합니다.

핵심:
- SmartEditor ONE은 mainFrame iframe 안에 있음 → iframe 컨텍스트에서 조작
- Stealth 모드 (자동화 감지 우회)
- 프로필 잠금 파일 자동 정리
- 팝업 iframe+page 양쪽 탐색
- 안전장치 (일일 발행 제한, 랜덤 타이핑)
"""

import asyncio
import json
import os
import random
import re
import signal
import subprocess
from datetime import date
from pathlib import Path

from playwright.async_api import async_playwright, Frame, Page, Browser

from config import CHROME_PROFILES_DIR


# ===== Stealth 설정 (App_blog_auto3 기반) =====
STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-infobars",
]

STEALTH_JS = """
    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
    window.chrome = {runtime: {}};
    Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
    Object.defineProperty(navigator, 'languages', {get: () => ['ko-KR', 'ko', 'en-US', 'en']});
"""

# ===== 인용구 스타일 6종 (SmartEditor ONE) =====
QUOTE_STYLES = {
    "default":   "se-l-default",            # 따옴표 ("")
    "line":      "se-l-quotation_line",     # 세로선
    "bubble":    "se-l-quotation_bubble",   # 말풍선
    "underline": "se-l-quotation_underline",# 밑줄
    "postit":    "se-l-quotation_postit",   # 포스트잇
    "corner":    "se-l-quotation_corner",   # 프레임 (모서리 꺾쇠)
}

# ===== 테마 시스템 (11종, 매 발행 랜덤) =====
FORMATTING_THEMES = [
    {"name": "클래식",   "heading_quote": "line",      "heading_quote_secondary": "default"},
    {"name": "모던",     "heading_quote": "underline",  "heading_quote_secondary": "line"},
    {"name": "미니멀",   "heading_quote": "default",    "heading_quote_secondary": "underline"},
    {"name": "캐주얼",   "heading_quote": "bubble",     "heading_quote_secondary": "postit"},
    {"name": "포멀",     "heading_quote": "corner",     "heading_quote_secondary": "default"},
    {"name": "따뜻한",   "heading_quote": "postit",     "heading_quote_secondary": "line"},
    {"name": "시크",     "heading_quote": "line",       "heading_quote_secondary": "corner"},
    {"name": "내추럴",   "heading_quote": "underline",  "heading_quote_secondary": "postit"},
    {"name": "포인트",   "heading_quote": "default",    "heading_quote_secondary": "corner"},
    {"name": "튜토리얼", "heading_quote": "underline",  "heading_quote_secondary": "line"},
    {"name": "스토리",   "heading_quote": "line",       "heading_quote_secondary": "bubble"},
]

LINE_FAMILY = {"line", "underline"}
BOX_FAMILY = {"default", "corner", "postit"}


def pick_formatting_theme() -> dict:
    return random.choice(FORMATTING_THEMES)


def strip_body_quotes(content: str) -> str:
    """## 소제목은 유지하고, 본문의 > 인용구만 제거."""
    lines = content.split("\n")
    result = []
    for line in lines:
        stripped = line.strip()
        if re.match(r'^>\w*>\s+', stripped):
            result.append(re.sub(r'^>\w*>\s+', '', stripped))
        elif stripped.startswith("> "):
            result.append(stripped[2:])
        elif stripped.startswith(">>"):
            result.append(stripped[2:].lstrip())
        elif stripped == ">":
            result.append("")
        else:
            result.append(line)
    return "\n".join(result)


def resolve_heading_style(
    theme: dict, has_image_after: bool, heading_index: int, explicit: str | None = None
) -> str:
    """테마 + 이미지 문맥 + 순번을 고려한 소제목 인용구 스타일 결정.

    원칙:
    - AI 명시 스타일 > 테마+맥락 > 기본값
    - 이미지 위: 라인 계열(line, underline) 선호
    - 이미지 없음: 박스 계열(default, corner, postit) 선호
    - 테마 primary/secondary가 해당 계열에 있으면 우선 후보
    - 최소 2종 보장 (backup 리스트에서 채움) — heading_index로 순환
    """
    if explicit and explicit in QUOTE_STYLES:
        return explicit

    primary = theme.get("heading_quote", "line")
    secondary = theme.get("heading_quote_secondary", "default")

    LINE_BACKUP = ["line", "underline"]
    BOX_BACKUP = ["default", "corner", "postit"]

    family_filter = LINE_FAMILY if has_image_after else BOX_FAMILY
    backup = LINE_BACKUP if has_image_after else BOX_BACKUP

    # 테마 primary/secondary 중 family에 맞는 것만 후보로
    candidates: list[str] = []
    for s in (primary, secondary):
        if s in family_filter and s not in candidates:
            candidates.append(s)

    # 최소 2종 보장 — backup에서 추가
    for b in backup:
        if b not in candidates:
            candidates.append(b)
            if len(candidates) >= 2:
                break

    # 그래도 비어있으면 안전 기본값
    if not candidates:
        candidates = [backup[0]]

    return candidates[heading_index % len(candidates)]


# ===== 발행 카운터 (기록용, 제한 없음) =====
PUBLISH_COUNTER_FILE = Path(__file__).parent.parent / ".publish_counter.json"

# GC 방지를 위한 브라우저 참조 보관 (auto_publish=False 시 Chrome 열어두기)
# Python GC가 Playwright 인스턴스를 정리하면 Chrome도 함께 종료되므로 모듈 레벨에 참조 유지
_detached_contexts: list = []


def _load_counter() -> dict:
    today = str(date.today())
    if not PUBLISH_COUNTER_FILE.exists():
        return {"date": today, "count": 0}
    try:
        data = json.loads(PUBLISH_COUNTER_FILE.read_text())
        if data.get("date") != today:
            return {"date": today, "count": 0}
        return data
    except Exception:
        return {"date": today, "count": 0}


def _save_counter(data: dict):
    PUBLISH_COUNTER_FILE.write_text(json.dumps(data))


def _increment_counter(data: dict):
    data["count"] = data.get("count", 0) + 1
    _save_counter(data)
    return data


class NaverBlogPublisher:
    def __init__(self):
        self.browser: Browser | None = None
        self.page: Page | None = None
        self.editor_frame: Frame | None = None
        self._image_failures: int = 0
        self._heading_count: int = 0

    # ===== 사람 흉내내기 =====
    async def _human_pause(self, min_ms: int = 500, max_ms: int = 2000):
        if self.page:
            await self.page.wait_for_timeout(random.randint(min_ms, max_ms))

    async def _human_type(self, text: str, min_delay: int = 40, max_delay: int = 120):
        if not self.page:
            return
        for char in text:
            await self.page.keyboard.type(char, delay=random.randint(min_delay, max_delay))
            if random.random() < 0.02:
                await self.page.wait_for_timeout(random.randint(300, 900))

    # ===== 프로필 관리 (App_blog_auto3 기반) =====
    def _clear_profile_locks(self, profile: str):
        """크롬 프로필 잠금 파일 강제 제거"""
        profile_path = Path(profile)
        for lock_file in ["SingletonLock", "SingletonCookie", "SingletonSocket"]:
            lock = profile_path / lock_file
            try:
                if lock.exists() or lock.is_symlink():
                    lock.unlink()
                    print(f"  잠금 파일 제거: {lock_file}")
            except Exception:
                pass

    def _kill_stale_chrome(self, profile: str):
        """해당 프로필을 사용 중인 기존 크롬 프로세스 종료"""
        try:
            result = subprocess.run(
                ["pgrep", "-f", profile],
                capture_output=True, text=True, timeout=5,
            )
            pids = result.stdout.strip().split("\n")
            for pid in pids:
                pid = pid.strip()
                if pid and pid.isdigit():
                    try:
                        os.kill(int(pid), signal.SIGKILL)
                        print(f"  기존 프로세스 종료: PID {pid}")
                    except ProcessLookupError:
                        pass
        except Exception:
            pass

    # ===== 에러 디버깅 =====
    async def _save_error_screenshot(self, name: str):
        if self.page:
            try:
                path = f"/tmp/app_blog2_error_{name}.png"
                await self.page.screenshot(path=path)
                print(f"📸 에러 스크린샷: {path}")
            except Exception:
                pass

    # ===== 브라우저 실행 =====
    async def _launch_browser(self, profile_path: str = ""):
        """전용 프로필로 Chromium 실행 (stealth 모드)"""
        profile_dir = Path(profile_path) if profile_path else Path(CHROME_PROFILES_DIR) / "default"
        profile_dir.mkdir(parents=True, exist_ok=True)

        # 프로필 잠금 해제
        self._kill_stale_chrome(str(profile_dir))
        await asyncio.sleep(1)
        self._clear_profile_locks(str(profile_dir))

        pw = await async_playwright().start()
        self._pw = pw  # GC 방지용 참조 (auto_publish=False 시 사용)
        self.browser = await pw.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            args=STEALTH_ARGS,
            viewport={"width": 1280, "height": 900},
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            ignore_default_args=["--enable-automation"],
        )

        if self.browser.pages:
            self.page = self.browser.pages[0]
        else:
            self.page = await self.browser.new_page()

        # Stealth JS 주입
        await self.page.add_init_script(STEALTH_JS)

    # ===== 자동 로그인 (App_blog_auto3 기반 3단계 폴백) =====
    async def _auto_login(self, naver_id: str, naver_pw: str):
        """ID/PW 자동 입력 + 로그인. 3단계 폴백."""
        if not self.page:
            return

        # 이미 로그인 상태면 스킵
        url = self.page.url.lower()
        if "nidlogin" not in url and "/login" not in url:
            return

        print(f"  자동 로그인 시도: {naver_id}")
        await asyncio.sleep(2)

        # === ID 입력 (3단계 폴백) ===
        try:
            id_field = await self.page.wait_for_selector("#id", timeout=10000)
        except Exception:
            raise RuntimeError("로그인 페이지에서 ID 입력칸을 찾을 수 없습니다.")

        # 방법 1: Playwright fill
        try:
            await id_field.click()
            await asyncio.sleep(0.5)
            await self.page.fill("#id", naver_id)
        except Exception:
            pass

        # 방법 2: 한 글자씩 타이핑
        current_val = await id_field.evaluate("el => el.value")
        if not current_val:
            try:
                await id_field.click(click_count=3)
                await self.page.keyboard.type(naver_id, delay=50)
            except Exception:
                pass

        # 방법 3: JavaScript 인젝션
        current_val = await id_field.evaluate("el => el.value")
        if not current_val:
            safe_id = json.dumps(naver_id)
            await self.page.evaluate(f"""
                const el = document.getElementById('id');
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                setter.call(el, {safe_id});
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
            """)

        await asyncio.sleep(0.5)

        # === PW 입력 (동일 3단계) ===
        try:
            pw_field = await self.page.wait_for_selector("#pw", timeout=5000)
        except Exception:
            raise RuntimeError("비밀번호 입력칸을 찾을 수 없습니다.")

        try:
            await pw_field.click()
            await asyncio.sleep(0.5)
            await self.page.fill("#pw", naver_pw)
        except Exception:
            pass

        current_val = await pw_field.evaluate("el => el.value")
        if not current_val:
            try:
                await pw_field.click(click_count=3)
                await self.page.keyboard.type(naver_pw, delay=50)
            except Exception:
                pass

        current_val = await pw_field.evaluate("el => el.value")
        if not current_val:
            safe_pw = json.dumps(naver_pw)
            await self.page.evaluate(f"""
                const el = document.getElementById('pw');
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                ).set;
                setter.call(el, {safe_pw});
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
            """)

        await asyncio.sleep(0.5)

        # === 로그인 버튼 클릭 ===
        login_btn = await self.page.query_selector(
            '#log\\.login, button[type="submit"], .btn_login, .btn_global'
        )
        if login_btn:
            await login_btn.click()
        else:
            await self.page.keyboard.press("Enter")

        # === 로그인 결과 대기 (최대 30초) ===
        for _ in range(30):
            await asyncio.sleep(1)
            url = self.page.url.lower()
            if "nidlogin" not in url and "/login" not in url:
                print(f"  ✓ 자동 로그인 성공: {naver_id}")
                return

        # === CAPTCHA 감지 → 수동 대기 (최대 2분) ===
        captcha = await self.page.query_selector("#captcha, [class*='captcha']")
        if captcha:
            print("  ⚠ CAPTCHA 감지! 브라우저에서 직접 해결하세요. (최대 2분 대기)")
            for _ in range(120):
                await asyncio.sleep(1)
                if "nidlogin" not in self.page.url.lower():
                    print("  ✓ CAPTCHA 해결 후 로그인 성공!")
                    return
            raise RuntimeError("CAPTCHA 해결 시간 초과 (2분)")

        # 에러 메시지 확인
        error_el = await self.page.query_selector(".error_message, #err_common")
        if error_el and await error_el.is_visible():
            err_text = await error_el.evaluate("el => el.textContent?.trim() || ''")
            raise RuntimeError(f"로그인 실패: {err_text}")

        raise RuntimeError("로그인 실패. ID/비밀번호를 확인하세요.")

    # ===== 에디터 진입 =====
    async def _navigate_to_editor(self, naver_id: str = "", naver_pw: str = ""):
        """글쓰기 페이지 이동 + 로그인 감지(자동/수동)"""
        if not self.page:
            raise RuntimeError("브라우저가 실행되지 않았습니다.")

        await self.page.goto("https://blog.naver.com/GoBlogWrite.naver")
        await self._human_pause(1500, 2500)

        # 로그인 페이지 리다이렉트 감지
        current_url = self.page.url
        if "nid.naver.com" in current_url or "/login" in current_url.lower():
            if naver_id and naver_pw:
                # 자동 로그인 시도
                await self._auto_login(naver_id, naver_pw)
            else:
                # ID/PW 없으면 수동 대기
                print("━" * 60)
                print("⏳ 네이버 로그인이 필요합니다.")
                print("   열린 브라우저 창에서 직접 로그인해주세요.")
                print("   (로그인 유지 체크 권장 · 최대 5분 대기)")
                print("━" * 60)
                try:
                    await self.page.wait_for_function(
                        """() => !location.hostname.includes('nid.naver.com')
                               && !location.pathname.toLowerCase().includes('/login')""",
                        timeout=300_000,
                    )
                except Exception:
                    raise RuntimeError(
                        "로그인 시간이 초과되었습니다 (5분). "
                        "다시 발행 버튼을 눌러 시도해주세요."
                    )

            # 로그인 후 에디터로 재이동
            if "GoBlogWrite" not in self.page.url:
                await self.page.goto("https://blog.naver.com/GoBlogWrite.naver")

        # 네트워크 안정 대기
        try:
            await self.page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass

    # ===== ★ iframe 처리 (핵심, App_blog_auto3 기반) =====
    async def _wait_for_editor_frame(self, timeout: int = 30) -> Frame:
        """mainFrame iframe + .se-content 로드 대기 (폴링)"""
        print("  에디터 iframe 대기 중...")
        for i in range(timeout * 2):  # 0.5초 간격
            # 로그인 페이지로 다시 튕겼는지 체크
            url_lower = (self.page.url or "").lower()
            if "nidlogin" in url_lower or "/login" in url_lower:
                raise RuntimeError("에디터 로드 중 로그인 페이지로 리다이렉트됨")

            for frame in self.page.frames:
                matched = ("PostWrite" in (frame.url or "")) or (frame.name == "mainFrame")
                if not matched:
                    continue
                content = await frame.query_selector(".se-content")
                if content:
                    self.editor_frame = frame
                    print(f"  ✓ 에디터 iframe 발견 ({i * 0.5:.1f}초)")
                    return frame

            await asyncio.sleep(0.5)

        await self._save_error_screenshot("iframe_not_found")
        raise RuntimeError("에디터 iframe을 찾을 수 없습니다 (30초 초과)")

    # ===== 팝업 닫기 (App_blog_auto3 기반) =====
    async def _dismiss_popups(self, frame: Frame) -> bool:
        """iframe 안팎 양쪽에서 팝업 탐색 + dim 레이어 폴백"""

        # ⚠️ 광역 selector 'button:has-text("취소")' 제거됨 (2026-04-26).
        # 이유: :has-text("취소")는 부분 매칭이라 SmartEditor 툴바의 "취소선" 버튼도 매칭되어
        #      본문 입력 전에 취소선 모드가 ON 되는 부수효과가 있었음.
        # 팝업의 취소 버튼은 .se-popup-button-cancel 클래스로 명확히 식별 가능.
        cancel_selectors = [
            '.se-popup-alert-confirm button.se-popup-button-cancel',
            '.se-popup-alert button.se-popup-button-cancel',
            'button.se-popup-button-cancel',
        ]

        # iframe + page 양쪽에서 찾기
        scopes = [("iframe", frame), ("page", self.page)]
        for scope_name, scope in scopes:
            for selector in cancel_selectors:
                try:
                    el = await scope.query_selector(selector)
                    if el and await el.is_visible():
                        await el.click()
                        await asyncio.sleep(0.8)
                        print(f"  ✓ 팝업 닫기 완료 ({scope_name}: {selector})")
                        return True
                except Exception:
                    continue

        # dim 레이어 폴백
        try:
            dim = await frame.query_selector('.se-popup-dim')
            if dim and await dim.is_visible():
                await dim.click()
                await asyncio.sleep(0.8)
                print("  ✓ 팝업 닫기 완료 (dim 레이어)")
                return True
        except Exception:
            pass

        return False

    # ===== [DEPRECATED 2026-04-26] 옛 인용구 커서 가드 시스템 (App_blog_auto2 이식) =====
    # publish()는 새 _input_body / _exit_quotation / _click_below_component 를 사용.
    # 이 영역의 가드 함수들은 모두 미호출 (dead code). 롤백 시 활성화.

    async def _is_cursor_in_quote(self, frame: Frame) -> bool:
        """현재 편집 컨텍스트가 .se-component.se-quotation 내부인지 확인.

        SmartEditor는 자체 커서 관리를 사용하므로, window.getSelection() 뿐 아니라
        document.activeElement와 "마지막으로 편집된 .se-editable"도 함께 확인한다.
        """
        try:
            return await frame.evaluate("""
                () => {
                    // 1) Selection 기반
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount) {
                        let node = sel.anchorNode;
                        if (node && node.nodeType === 3) node = node.parentElement;
                        if (node && node.closest('.se-component.se-quotation')) return true;
                    }
                    // 2) activeElement 기반
                    const ae = document.activeElement;
                    if (ae && ae.closest && ae.closest('.se-component.se-quotation')) return true;
                    // 3) SmartEditor가 내부적으로 쓰는 .se-editable focused 마커
                    const focused = document.querySelector('.se-editable.se-focus, .se-text-paragraph.se-focus');
                    if (focused && focused.closest('.se-component.se-quotation')) return true;
                    return false;
                }
            """)
        except Exception:
            return False

    async def _get_last_text_component_bottom(self, frame: Frame) -> dict | None:
        """에디터 내 마지막 .se-component.se-text의 '하단 중앙 viewport 좌표'를 돌려준다.

        이 좌표를 실제 마우스로 클릭하면 SmartEditor가 해당 paragraph에 포커스를 잡고,
        인용구 바깥의 편집 가능 영역으로 커서가 정확히 이동한다.
        """
        try:
            return await frame.evaluate("""
                () => {
                    const texts = document.querySelectorAll('.se-component.se-text');
                    if (texts.length === 0) return null;
                    const last = texts[texts.length - 1];
                    const para = last.querySelector('.se-text-paragraph') || last;
                    const r = para.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) return null;
                    return {x: r.left + Math.min(40, r.width * 0.2), y: r.top + r.height / 2};
                }
            """)
        except Exception:
            return None

    async def _click_at_frame_coord(self, frame: Frame, x: float, y: float) -> None:
        """iframe 내부 좌표를 페이지 전체 좌표로 변환하여 실제 마우스 클릭.

        iframe 내부 getBoundingClientRect()는 iframe viewport 기준이므로,
        iframe element의 bounding box 오프셋을 더해서 페이지 좌표로 변환해야 한다.
        """
        try:
            frame_element = await frame.frame_element()
            box = await frame_element.bounding_box()
            if box:
                page_x = box["x"] + x
                page_y = box["y"] + y
                await self.page.mouse.click(page_x, page_y)
                await asyncio.sleep(0.4)
        except Exception as e:
            print(f"      ⚠ iframe 좌표 클릭 실패: {str(e)[:80]}")

    async def _js_place_cursor_after_quotation(self, frame: Frame) -> bool:
        """JS Selection API로 마지막 인용구 바로 뒤 텍스트 영역에 커서 배치.

        마우스 클릭에 의존하지 않고 DOM에서 직접 커서를 이동시킨다.
        인용구 뒤에 텍스트 컴포넌트가 없으면, 인용구 앞의 마지막 텍스트 컴포넌트를 사용한다.
        """
        try:
            result = await frame.evaluate("""
                () => {
                    const quotations = document.querySelectorAll('.se-component.se-quotation');
                    if (quotations.length === 0) return 'no_quotation';
                    const lastQ = quotations[quotations.length - 1];

                    // 1순위: 인용구 뒤의 첫 .se-component.se-text 찾기
                    let target = lastQ.nextElementSibling;
                    while (target && !target.classList.contains('se-text')) {
                        target = target.nextElementSibling;
                    }

                    // 2순위: 인용구 앞의 마지막 .se-component.se-text 찾기
                    if (!target) {
                        target = lastQ.previousElementSibling;
                        while (target && !target.classList.contains('se-text')) {
                            target = target.previousElementSibling;
                        }
                    }

                    if (!target) return 'no_text_component';

                    // 텍스트 영역의 paragraph 찾기
                    const para = target.querySelector('.se-text-paragraph');
                    if (!para) return 'no_paragraph';

                    // span.__se-node 찾기 (없으면 paragraph 자체 사용)
                    let focusNode = para.querySelector('span.__se-node') || para;

                    // Selection API로 커서 배치 (끝 위치)
                    const range = document.createRange();
                    if (focusNode.childNodes.length > 0) {
                        range.setStartAfter(focusNode.lastChild);
                    } else {
                        range.setStart(focusNode, 0);
                    }
                    range.collapse(true);

                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);

                    // 클릭 이벤트도 발생시켜 SmartEditor 내부 상태 동기화
                    para.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                    para.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    para.dispatchEvent(new MouseEvent('click', {bubbles: true}));

                    return 'ok';
                }
            """)
            success = result == 'ok'
            print(f"      JS커서이동: {result}")
            return success
        except Exception as e:
            print(f"      JS커서이동 실패: {str(e)[:80]}")
            return False

    async def _force_cursor_after_last_quote(self, frame: Frame) -> str:
        """마지막 인용구 뒤로 커서를 강제 이동.

        전략 (실패 시 다음 단계로):
        0) JS Selection API로 직접 커서 배치 (가장 확실)
        1) 마지막 text 컴포넌트 하단 실제 마우스 클릭
        2) 인용구 박스 아래 마우스 클릭
        3) 키보드 폴백
        """
        # ── 0단계: JS Selection API로 직접 커서 배치 (마우스 불필요) ──
        if await self._js_place_cursor_after_quotation(frame):
            await asyncio.sleep(0.3)
            if not await self._is_cursor_in_quote(frame):
                print(f"      ✓ exit 성공: JS커서이동")
                return "js_selection"
            else:
                print(f"      ⚠ JS커서이동 후에도 인용구 내부 감지 → 다음 단계")

        # ── 1단계: 마지막 text 컴포넌트 하단 실제 클릭 ──
        coord = await self._get_last_text_component_bottom(frame)
        if coord:
            await self._click_at_frame_coord(frame, coord["x"], coord["y"])
            await asyncio.sleep(0.3)
            if not await self._is_cursor_in_quote(frame):
                print(f"      ✓ exit 성공: 마우스클릭(text컴포넌트)")
                return "click_last_text"
            else:
                print(f"      ⚠ text컴포넌트 클릭 후에도 인용구 내부 → 다음 단계")

        # ── 2단계: 인용구 박스 아래 마우스 클릭 ──
        await self._exit_quotation(frame)
        await asyncio.sleep(0.3)
        if not await self._is_cursor_in_quote(frame):
            print(f"      ✓ exit 성공: 마우스클릭(인용구 아래)")
            return "exit_quotation"
        else:
            print(f"      ⚠ 인용구 아래 클릭 후에도 내부 → 키보드 폴백")

        # ── 3단계: 키보드 폴백 ──
        for _ in range(8):
            await self.page.keyboard.press("ArrowDown")
            await asyncio.sleep(0.05)
        await self.page.keyboard.press("End")
        await self.page.keyboard.press("Enter")
        await asyncio.sleep(0.1)
        await self.page.keyboard.press("Enter")
        await asyncio.sleep(0.2)

        still_in = await self._is_cursor_in_quote(frame)
        print(f"      {'⚠ 키보드 폴백 후에도 인용구 내부!' if still_in else '✓ exit 성공: 키보드폴백'}")
        return "keyboard_fallback"

    async def _ensure_outside_quote(self, frame: Frame, context: str = "") -> None:
        """다음 블록 입력 전 커서가 인용구 밖임을 보장한다 (idempotent 가드)."""
        in_quote = await self._is_cursor_in_quote(frame)
        if in_quote:
            print(f"    🛡 가드: 커서가 인용구 내부 감지 ({context}) → 강제 탈출")
            await self._force_cursor_after_last_quote(frame)
            # 최종 확인
            still_in = await self._is_cursor_in_quote(frame)
            if still_in:
                print(f"    ⚠⚠ 가드 최종 실패: 모든 exit 시도 후에도 인용구 내부 ({context})")

    # ===== 서식 초기화 (취소선·볼드 등 잔류 방지) =====
    async def _reset_editor_format(self, frame: Frame):
        """본문 입력 전 SmartEditor 의 서식 토글(취소선·볼드·이탤릭·밑줄)을 모두 OFF.

        2중 전략:
          1) 툴바에서 '활성화된 서식 버튼' 직접 클릭 (SmartEditor React state 정상 OFF)
          2) execCommand 보조 (deprecated 지만 일부 환경에서 동작)

        execCommand 만으로는 SmartEditor ONE 내부 상태가 리셋되지 않는 경우가 있어
        툴바 버튼 클릭이 가장 확실하다.
        """
        try:
            result = await frame.evaluate(r"""
                () => {
                    const log = [];
                    let toggled = 0;

                    // 1) 활성 상태인 서식 버튼 찾아서 클릭
                    //    SmartEditor ONE 서식 버튼은 활성 시 class 에
                    //    is-on / se-is-on / se-is-active / active 중 하나가 붙음
                    const formatKeywords = /strike|취소|bold|굵게|italic|이탤릭|기울|underline|밑줄/i;

                    document.querySelectorAll('button').forEach(btn => {
                        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                        const dataName = (btn.getAttribute('data-name') || '').toLowerCase();
                        const title = (btn.getAttribute('title') || '').toLowerCase();
                        const txt = (btn.textContent || '').toLowerCase();
                        const isFormat = formatKeywords.test(label + '|' + dataName + '|' + title + '|' + txt);
                        if (!isFormat) return;

                        const isActive = btn.classList.contains('is-on')
                            || btn.classList.contains('se-is-on')
                            || btn.classList.contains('se-is-active')
                            || btn.classList.contains('active')
                            || btn.getAttribute('aria-pressed') === 'true';

                        if (isActive) {
                            btn.click();
                            toggled++;
                            log.push(dataName || label || title || '<?>');
                        }
                    });

                    // 2) execCommand 보조
                    const editor = document.querySelector('.se-content');
                    if (editor && typeof editor.focus === 'function') editor.focus();
                    try { document.execCommand('removeFormat', false, null); } catch (e) {}
                    ['strikeThrough', 'bold', 'italic', 'underline'].forEach(cmd => {
                        try {
                            if (document.queryCommandState && document.queryCommandState(cmd)) {
                                document.execCommand(cmd, false, null);
                            }
                        } catch (e) {}
                    });

                    return { toggled, log };
                }
            """)
            toggled = result.get("toggled", 0) if isinstance(result, dict) else 0
            log = result.get("log", []) if isinstance(result, dict) else []
            if toggled > 0:
                print(f"  ✓ 툴바 서식 버튼 OFF: {toggled}개 ({', '.join(log)})")
            else:
                print("  ✓ 서식 초기화 (활성 버튼 없음)")
        except Exception as e:
            print(f"  ⚠ 서식 초기화 실패(무시): {e}")

    async def _diagnose_body_format(self, frame: Frame):
        """본문 첫 3개 paragraph 의 DOM 구조와 computed style 을 /tmp/ 에 덤프.

        취소선이 어디서 오는지 root cause 파악용.
        """
        try:
            diag = await frame.evaluate(r"""
                () => {
                    const result = [];
                    const paragraphs = Array.from(
                        document.querySelectorAll('.se-text-paragraph')
                    ).filter(p => !p.closest('.se-documentTitle')).slice(0, 3);

                    paragraphs.forEach((p, idx) => {
                        // DOM 트리 타고 올라가며 text-decoration 원인 찾기
                        const sources = [];
                        let el = p;
                        let depth = 0;
                        while (el && el.tagName && depth < 15) {
                            const cs = getComputedStyle(el);
                            const tdLine = cs.textDecorationLine;
                            const tdShort = cs.textDecoration;
                            if (tdLine && tdLine !== 'none' && tdLine !== '') {
                                sources.push({
                                    depth,
                                    tag: el.tagName,
                                    class: el.className || '',
                                    style: el.getAttribute('style') || '',
                                    textDecorationLine: tdLine,
                                    textDecoration: tdShort,
                                });
                            }
                            el = el.parentElement;
                            depth++;
                        }

                        result.push({
                            index: idx,
                            outerHTML_preview: p.outerHTML.substring(0, 800),
                            paragraph_class: p.className,
                            paragraph_computed: {
                                textDecoration: getComputedStyle(p).textDecoration,
                                textDecorationLine: getComputedStyle(p).textDecorationLine,
                            },
                            sources_with_decoration: sources,
                        });
                    });

                    return result;
                }
            """)
            diag_path = "/tmp/app_blog2_format_diagnosis.json"
            Path(diag_path).write_text(
                json.dumps(diag, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            src_count = sum(len(p.get("sources_with_decoration", [])) for p in diag)
            print(f"  📊 서식 진단 저장: {diag_path} (text-decoration 소스 {src_count}곳)")
        except Exception as e:
            print(f"  ⚠ 진단 실패(무시): {e}")

    async def _cleanup_body_strikethrough(self, frame: Frame):
        """본문 입력 완료 후 취소선을 완전히 제거. Nuclear 옵션.

        기존 inline style 제거로는 부족 — CSS 클래스 기반 스타일까지 덮어야 함.
        전략:
          1) 본문의 모든 요소(p 포함 + 내부 span·node 전부)에 대해
             style.setProperty('text-decoration', 'none', 'important') 적용
             → 어떤 CSS rule 이든 덮어버림
          2) 클래스 중 strike / line-through / 유사 키워드 포함된 것 제거
             (span 에 붙은 `se-l-strike`, `se-strike-xxx` 등)
          3) <s>, <strike>, <del> 태그 unwrap
          4) 볼드/이탤릭도 동일하게 !important 덮기
          5) input 이벤트 디스패치 → SmartEditor 가 DOM 변경을 인지
        """
        try:
            result = await frame.evaluate(r"""
                () => {
                    let touched = 0;
                    let classesRemoved = 0;
                    let tagsUnwrapped = 0;

                    const paragraphs = Array.from(
                        document.querySelectorAll('.se-text-paragraph')
                    ).filter(p => !p.closest('.se-documentTitle'));

                    const STRIKE_CLASS_RE = /strike|line-through|se-[a-z]-s$|se-s-|strikethrough/i;

                    paragraphs.forEach(p => {
                        // paragraph 자신 + 내부 모든 요소
                        const all = [p, ...p.querySelectorAll('*')];
                        all.forEach(el => {
                            // (1) text-decoration 강제 none !important
                            try {
                                el.style.setProperty('text-decoration', 'none', 'important');
                                el.style.setProperty('text-decoration-line', 'none', 'important');
                                el.style.setProperty('text-decoration-style', 'initial', 'important');
                                el.style.setProperty('text-decoration-color', 'initial', 'important');
                                touched++;
                            } catch (e) {}

                            // (2) 볼드/이탤릭 기본값으로 강제
                            try {
                                el.style.setProperty('font-weight', 'normal', 'important');
                                el.style.setProperty('font-style', 'normal', 'important');
                            } catch (e) {}

                            // (3) strikethrough 관련 클래스 제거
                            if (el.classList && el.classList.length > 0) {
                                Array.from(el.classList).forEach(cls => {
                                    if (STRIKE_CLASS_RE.test(cls)) {
                                        el.classList.remove(cls);
                                        classesRemoved++;
                                    }
                                });
                            }
                        });

                        // (4) <s>, <strike>, <del> 태그 unwrap (텍스트만 남김)
                        ['s', 'strike', 'del'].forEach(tagName => {
                            p.querySelectorAll(tagName).forEach(tag => {
                                const parent = tag.parentNode;
                                while (tag.firstChild) parent.insertBefore(tag.firstChild, tag);
                                tag.remove();
                                tagsUnwrapped++;
                            });
                        });

                        // (5) wrapper 컴포넌트 클래스에서도 strike 관련 제거
                        const comp = p.closest('.se-component');
                        if (comp) {
                            Array.from(comp.classList).forEach(cls => {
                                if (STRIKE_CLASS_RE.test(cls)) {
                                    comp.classList.remove(cls);
                                    classesRemoved++;
                                }
                            });
                        }

                        // (6) SmartEditor 에게 DOM 변경 알림
                        try {
                            p.dispatchEvent(new Event('input', { bubbles: true }));
                        } catch (e) {}
                    });

                    return { touched, classesRemoved, tagsUnwrapped };
                }
            """)
            print(
                f"  ✓ 본문 서식 강제 정리: 요소 {result['touched']}개 !important 적용, "
                f"클래스 {result['classesRemoved']}개, 태그 {result['tagsUnwrapped']}개 제거"
            )
        except Exception as e:
            print(f"  ⚠ 본문 정리 실패(무시): {e}")

    async def _clear_editor_storage(self, frame: Frame):
        """SmartEditor 가 localStorage/sessionStorage 에 저장한 서식 preference 를 제거.

        에디터 로드 시 저장소에서 마지막 format state 를 복원하는 경우 대응.
        """
        try:
            cleared = await frame.evaluate(r"""
                () => {
                    let removed = 0;
                    const STRIKE_KEY_RE = /strike|format|style|toolbar|editor/i;
                    try {
                        const keysToRemove = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && STRIKE_KEY_RE.test(k)) keysToRemove.push(k);
                        }
                        keysToRemove.forEach(k => {
                            localStorage.removeItem(k);
                            removed++;
                        });
                    } catch (e) {}
                    try {
                        const keysToRemove = [];
                        for (let i = 0; i < sessionStorage.length; i++) {
                            const k = sessionStorage.key(i);
                            if (k && STRIKE_KEY_RE.test(k)) keysToRemove.push(k);
                        }
                        keysToRemove.forEach(k => {
                            sessionStorage.removeItem(k);
                            removed++;
                        });
                    } catch (e) {}
                    return removed;
                }
            """)
            if cleared > 0:
                print(f"  ✓ 에디터 스토리지 정리: {cleared}개 키 삭제")
        except Exception as e:
            print(f"  ⚠ 스토리지 정리 실패(무시): {e}")

    # ===== [DEPRECATED 2026-04-26] 옛 소제목 인용구 삽입 (App_blog_auto2 체계) =====
    # publish()는 새 _insert_heading (App_blog_auto3 이식 버전)을 사용. 롤백 시 활성화.
    async def _OLD_insert_heading(self, frame: Frame, text: str, quote_style: str = "line"):
        """[DEPRECATED 2026-04-26] 옛 인용구 삽입 (키보드 typing 방식, 불안정).

        1) 인용구 버튼 클릭 → 빈 위젯 생성 (커서가 인용구 안에 위치)
        2) keyboard.type() 로 텍스트 입력 (SmartEditor React state 정상 반영)
        3) 인용구 밖으로 커서 탈출
        4) 스타일 변경
        폴백: 실패 시 볼드 텍스트
        """
        # 소제목 전 여백 (3줄) — exit 시 클릭 대상(.se-component.se-text) 확보
        for _ in range(3):
            await self.page.keyboard.press("Enter")
            await asyncio.sleep(0.1)

        quote_btn = await frame.query_selector('button[data-name="quotation"]')
        if not quote_btn:
            quote_btn = await frame.query_selector("button.se-toolbar-button-quotation")

        if quote_btn:
            try:
                await quote_btn.click(timeout=5000)
            except Exception as e:
                print(f"    ⚠ 인용구 버튼 클릭 실패: {str(e)[:60]}, 텍스트 폴백")
                await self._human_type(text, min_delay=5, max_delay=12)
                await self.page.keyboard.press("Enter")
                return
            await asyncio.sleep(1.0)

            # ★ 키보드 타이핑으로 텍스트 입력 (SmartEditor가 정상 인식)
            # 인용구 버튼 클릭 후 커서가 인용구 안에 위치해 있음
            await self.page.keyboard.type(text, delay=random.randint(10, 25))
            await asyncio.sleep(0.5)
            print(f"    ✓ 소제목(인용구/{quote_style}): {text[:30]}...")

            # 인용구 밖으로 커서 탈출
            await self._exit_quotation(frame)
            await asyncio.sleep(0.3)

            # 스타일 변경
            # 주의: _change_quotation_style은 인용구를 다시 클릭하여
            # 커서를 인용구 내부로 복귀시킴. 따라서 직후 2차 탈출 필수.
            await self._change_quotation_style(frame, quote_style)

            # ★★ 2차 EXIT + 가드: 본문이 인용구 안에 타이핑되는 버그 방지
            await self._force_cursor_after_last_quote(frame)
            await self._ensure_outside_quote(frame, context=f"after_heading:{text[:15]}")
        else:
            print(f"    ⚠ 인용구 버튼 못 찾음, 텍스트 폴백: {text[:30]}...")
            await self._human_type(text, min_delay=5, max_delay=12)
            await self.page.keyboard.press("Enter")

    async def _OLD_exit_quotation(self, frame: Frame):
        """[DEPRECATED 2026-04-26] 옛 인용구 밖 탈출 (3단계 폴백). publish() 미사용."""
        try:
            quotations = await frame.query_selector_all(".se-component.se-quotation")
            if quotations:
                last_quote = quotations[-1]
                box = await last_quote.bounding_box()
                if box:
                    click_x = box["x"] + box["width"] * 0.5
                    click_y = box["y"] + box["height"] + 20
                    await self.page.mouse.click(click_x, click_y)
                    await asyncio.sleep(0.5)
                    return True
        except Exception:
            pass

        try:
            content_area = await frame.query_selector(".se-content")
            if content_area:
                box = await content_area.bounding_box()
                if box:
                    click_x = box["x"] + box["width"] * 0.5
                    click_y = box["y"] + box["height"] - 10
                    await self.page.mouse.click(click_x, click_y)
                    await asyncio.sleep(0.5)
                    return True
        except Exception:
            pass

        for _ in range(5):
            await self.page.keyboard.press("ArrowDown")
            await asyncio.sleep(0.1)
        await self.page.keyboard.press("End")
        await asyncio.sleep(0.2)
        return False

    async def _OLD_change_quotation_style(self, frame: Frame, style: str):
        """[DEPRECATED 2026-04-26] 옛 스타일 변경 (툴바 클릭). publish() 미사용.

        SmartEditor의 속성 툴바 버튼 클릭으로 인용구 스타일 변경.

        시도 1: 마지막 인용구 클릭 → wait_for_selector로 레이아웃 버튼 대기 → 클릭
                (SmartEditor 내부 상태 정상 반영)
        시도 2 (폴백): JS className 직접 교체
                (SmartEditor 재렌더 시 리셋될 수 있지만 없는 것보다 나음)
        """
        # SmartEditor의 실제 data-value는 스타일명과 다르므로 매핑 필요
        style_value_map = {
            "default": "default",
            "line": "quotation_line",
            "bubble": "quotation_bubble",
            "underline": "quotation_underline",
            "postit": "quotation_postit",
            "corner": "quotation_corner",
        }
        target_value = style_value_map.get(style, "default")
        if target_value == "default":
            return

        # ★ 스타일 변경 전 반드시 인용구 밖으로 이동
        # 밖에서 클릭해야 "컴포넌트 선택 모드" 진입 → 레이아웃 툴바 표시
        await self._force_cursor_after_last_quote(frame)

        target_class = QUOTE_STYLES.get(style, "se-l-default")

        # 시도 1: 인용구 클릭 → 속성 툴바의 스타일 버튼 대기 후 클릭
        try:
            quotations = await frame.query_selector_all(".se-component.se-quotation")
            if quotations:
                last_q = quotations[-1]
                await last_q.click(timeout=3000)
                await asyncio.sleep(0.5)

                selector = f'button[data-name="quotation-layout"][data-value="{target_value}"]'
                try:
                    style_btn = await frame.wait_for_selector(
                        selector, timeout=3000, state="visible"
                    )
                    if style_btn:
                        await style_btn.click(timeout=3000)
                        await asyncio.sleep(0.4)
                        print(f"      스타일 변경(버튼): {style} ({target_value})")
                        return
                except Exception as e:
                    print(f"      ⚠ 스타일 버튼 클릭 실패 ({target_value}): {str(e)[:80]}")
        except Exception:
            pass

        # 시도 2 (폴백): JS className 직접 교체
        try:
            result = await frame.evaluate(f"""
                () => {{
                    const quotes = document.querySelectorAll('.se-component.se-quotation');
                    const q = quotes[quotes.length - 1];
                    if (!q) return 'no quotation';
                    q.className = q.className.replace(/se-l-[\\w]+/, '{target_class}');
                    return 'ok';
                }}
            """)
            if result == "ok":
                print(f"      스타일 변경(JS 폴백): {style}")
        except Exception as e:
            print(f"      ⚠ 스타일 변경 실패: {e}")

    # ===== 제목 입력 (iframe 내, App_blog_auto3 셀렉터) =====
    async def _type_title(self, title: str):
        frame = self.editor_frame
        if not frame:
            raise RuntimeError("에디터 iframe이 없습니다.")

        # 포커스 초기화
        try:
            await frame.evaluate("document.activeElement?.blur?.()")
        except Exception:
            pass

        # 다중 셀렉터 후보 (App_blog_auto3 검증 기준)
        candidates = [
            ".se-placeholder.__se_placeholder",
            ".se-documentTitle .se-placeholder",
            ".se-title-text .se-placeholder",
            ".se-documentTitle [contenteditable='true']",
            ".se-title-text",
        ]

        clicked = False
        for sel in candidates:
            try:
                el = await frame.wait_for_selector(sel, timeout=5000)
                if el:
                    await el.click()
                    clicked = True
                    print(f"  ✓ 제목 영역 클릭 ({sel})")
                    break
            except Exception:
                continue

        if not clicked:
            await self._save_error_screenshot("title_not_found")
            raise RuntimeError("제목 입력칸을 찾지 못했습니다.")

        await self._human_pause(300, 800)
        await self._human_type(title, min_delay=50, max_delay=150)
        print(f"  ✓ 제목 입력 완료: {title[:30]}...")

    # ===== 본문 입력 (iframe 내, App_blog_auto3 셀렉터) =====
    async def _type_content(self, content: str):
        """[DEPRECATED 2026-04-26] 옛 본문 입력 (이미지 없는 케이스).
        publish()는 _input_body (App_blog_auto3) 사용. 롤백 시 활성화."""
        frame = self.editor_frame
        if not frame:
            raise RuntimeError("에디터 iframe이 없습니다.")

        # 서식 잔재 강력 초기화: 스토리지 → 진단 → 툴바/execCommand 리셋
        await self._clear_editor_storage(frame)
        await self._diagnose_body_format(frame)
        await self._reset_editor_format(frame)

        # 본문 영역 클릭 (제목 밖의 paragraph)
        body_area = await frame.query_selector(".se-sections .se-text-paragraph")
        if not body_area:
            body_area = await frame.evaluate_handle("""
                () => {
                    const all = document.querySelectorAll('.se-text-paragraph');
                    for (const el of all) {
                        if (!el.closest('.se-documentTitle')) return el;
                    }
                    return null;
                }
            """)

        if body_area:
            try:
                await body_area.click()
            except Exception:
                # 포커스 직접 이동
                try:
                    await frame.evaluate("""
                        () => {
                            const all = document.querySelectorAll('.se-text-paragraph');
                            for (const el of all) {
                                if (!el.closest('.se-documentTitle')) {
                                    el.focus();
                                    return;
                                }
                            }
                        }
                    """)
                except Exception:
                    pass
        else:
            await self._save_error_screenshot("body_not_found")
            raise RuntimeError("본문 입력칸을 찾지 못했습니다.")

        await self._human_pause(500, 1200)

        # 마크다운 → 일반 텍스트 변환 후 입력
        plain_text = self._markdown_to_plain(content)
        lines = plain_text.split("\n")

        heading_re = re.compile(r'^(#{2,3})(\{(\w+)\})?\s+(.+)$')
        heading_index = 0
        prev_was_heading = False

        for i, line in enumerate(lines):
            stripped = line.strip()
            heading_m = heading_re.match(stripped)

            if not stripped:
                if prev_was_heading:
                    continue  # 소제목 직후 빈 줄은 스킵 (_insert_heading이 간격 처리)
                # 일반 빈 줄은 아래 Enter로 처리
            elif heading_m:
                # ★ 소제목 → 인용구 위젯으로 삽입
                explicit_style = heading_m.group(3)
                heading_text = heading_m.group(4).strip()
                next_stripped = lines[i + 1].strip() if i + 1 < len(lines) else ""
                has_image_after = bool(re.match(r'^\s*\[이미지:', next_stripped))
                style = resolve_heading_style(
                    self._theme, has_image_after, heading_index, explicit_style
                )
                await self._insert_heading(self.editor_frame, heading_text, style)
                heading_index += 1
                prev_was_heading = True
            else:
                # 🛡 본문 타이핑 전 가드: 커서가 인용구 밖인지 확인
                if prev_was_heading:
                    await self._force_cursor_after_last_quote(self.editor_frame)
                    await self._reset_editor_format(self.editor_frame)
                elif stripped:
                    await self._ensure_outside_quote(self.editor_frame, context=f"before_line:{i}")
                prev_was_heading = False

                if stripped:
                    await self._human_type(line, min_delay=30, max_delay=90)

            if i < len(lines) - 1:
                if not heading_m:
                    await self.page.keyboard.press("Enter")
                    await self.page.wait_for_timeout(random.randint(80, 250))

            if random.random() < 0.05:
                await self._human_pause(800, 2000)

        print("  ✓ 본문 입력 완료")

        # 입력 후 진단 → DOM 레벨 Nuclear 정리
        await self._diagnose_body_format(frame)
        await self._cleanup_body_strikethrough(frame)
        # 정리 후 최종 확인 진단
        await self._diagnose_body_format(frame)

    def _markdown_to_plain(self, md: str) -> str:
        """마크다운 기호만 제거. ## 소제목과 [이미지: ...] 마커는 보존한다."""
        text = md
        # ## 소제목은 제거하지 않음 (타이핑 루프에서 인용구로 변환해야 하므로)
        text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
        text = re.sub(r"\*(.*?)\*", r"\1", text)
        return text

    # ===== [DEPRECATED 2026-04-26] 옛 본문 + 이미지 즉시변환 방식 =====
    # publish()는 _input_body (App_blog_auto3) 사용. 롤백 시 활성화.
    async def _type_content_with_images(
        self,
        content: str,
        image_slots: list[dict],
        frame: Frame,
    ):
        """본문을 줄 단위로 입력하되 [이미지: ...] 마커 만나면 해당 슬롯 이미지를 업로드.

        image_slots은 본문 등장 순서와 동일한 순서로 전달되어야 한다.
        페어(그룹 ID 공유 + pair_role="first")는 다음 마커와 묶어 한 번에 2장 업로드.
        """
        if not self.page:
            raise RuntimeError("페이지 미초기화")

        # 서식 잔재 강력 초기화: 스토리지 → 진단 → 툴바/execCommand 리셋
        await self._clear_editor_storage(frame)
        await self._diagnose_body_format(frame)
        await self._reset_editor_format(frame)

        # 본문 영역 포커스 (기존 _type_content와 동일 로직)
        body_area = await frame.query_selector(".se-sections .se-text-paragraph")
        if not body_area:
            body_area = await frame.evaluate_handle("""
                () => {
                    const all = document.querySelectorAll('.se-text-paragraph');
                    for (const el of all) {
                        if (!el.closest('.se-documentTitle')) return el;
                    }
                    return null;
                }
            """)
        if body_area:
            try:
                await body_area.click()
            except Exception:
                try:
                    await frame.evaluate("""
                        () => {
                            const all = document.querySelectorAll('.se-text-paragraph');
                            for (const el of all) {
                                if (!el.closest('.se-documentTitle')) {
                                    el.focus();
                                    return;
                                }
                            }
                        }
                    """)
                except Exception:
                    pass
        else:
            await self._save_error_screenshot("body_not_found")
            raise RuntimeError("본문 입력칸을 찾지 못했습니다.")

        await self._human_pause(500, 1200)

        # 마커 순서대로 슬롯 큐
        slot_queue = list(image_slots)

        plain_text = self._markdown_to_plain(content)
        lines = plain_text.split("\n")

        marker_re = re.compile(r"^\s*\[이미지:\s*(.+?)\]\s*$")
        heading_re = re.compile(r'^(#{2,3})(\{(\w+)\})?\s+(.+)$')
        heading_index = 0
        prev_was_heading = False

        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            m = marker_re.match(line)
            heading_m = heading_re.match(stripped)

            # 소제목 직후 빈 줄은 스킵 (_insert_heading이 간격 처리)
            if not stripped and not m and not heading_m:
                if prev_was_heading:
                    i += 1
                    continue

            if m:
                # 🛡 이미지 마커 전 가드 (소제목 직후 이미지일 수 있음)
                if prev_was_heading:
                    await self._force_cursor_after_last_quote(frame)
                    await self._reset_editor_format(frame)
                prev_was_heading = False

                # 이미지 마커 → 이미지 업로드
                slot = slot_queue.pop(0) if slot_queue else None
                if slot is None:
                    print(f"  ⚠ 마커 초과: 슬롯 부족으로 스킵 ({m.group(1)[:20]})")
                else:
                    is_first_of_pair = (
                        slot.get("group_id") and slot.get("pair_role") == "first"
                    )
                    partner = None
                    consumed_extra = 0
                    if is_first_of_pair and slot_queue:
                        j = i + 1
                        while j < len(lines) and lines[j].strip() == "":
                            j += 1
                        if j < len(lines):
                            m2 = marker_re.match(lines[j])
                            if (
                                m2
                                and slot_queue[0].get("group_id") == slot.get("group_id")
                                and slot_queue[0].get("pair_role") == "second"
                            ):
                                partner = slot_queue.pop(0)
                                consumed_extra = j - i
                    try:
                        if partner:
                            await self._insert_image_pair(
                                frame,
                                Path(slot["path"]),
                                Path(partner["path"]),
                            )
                        else:
                            await self._insert_image(frame, Path(slot["path"]))
                    except Exception as e:
                        self._image_failures += 1
                        print(f"  ⚠ 이미지 업로드 실패: {e}")
                    if consumed_extra:
                        i += consumed_extra
            elif heading_m:
                # ★ 소제목 → 인용구 위젯으로 삽입
                explicit_style = heading_m.group(3)
                heading_text = heading_m.group(4).strip()
                next_stripped = lines[i + 1].strip() if i + 1 < len(lines) else ""
                has_image_after = bool(marker_re.match(next_stripped))
                style = resolve_heading_style(
                    self._theme, has_image_after, heading_index, explicit_style
                )
                await self._insert_heading(frame, heading_text, style)
                heading_index += 1
                prev_was_heading = True
            elif stripped:
                # 🛡 본문 타이핑 전 가드: 커서가 인용구 밖인지 확인
                if prev_was_heading:
                    await self._force_cursor_after_last_quote(frame)
                    await self._reset_editor_format(frame)
                else:
                    await self._ensure_outside_quote(frame, context=f"before_line:{i}")
                prev_was_heading = False

                await self._human_type(line, min_delay=30, max_delay=90)
            else:
                prev_was_heading = False

            # 다음 줄로
            is_special = bool(m) or bool(heading_m)
            if i < len(lines) - 1:
                if not is_special:
                    await self.page.keyboard.press("Enter")
                    await self.page.wait_for_timeout(random.randint(80, 250))

            if random.random() < 0.05:
                await self._human_pause(800, 2000)

            i += 1

        print("  ✓ 본문 입력 완료 (이미지 포함)")

        # 입력 후 진단 → DOM 레벨 Nuclear 정리
        await self._diagnose_body_format(frame)
        await self._cleanup_body_strikethrough(frame)
        # 정리 후 최종 확인 진단
        await self._diagnose_body_format(frame)

    # ===== 2단계 후처리 방식: Phase 1 (텍스트 입력) + Phase 2 (인용구 변환) =====

    async def _type_content_phase1(
        self,
        content: str,
        image_slots: list[dict] | None,
        frame: Frame,
    ) -> list[dict]:
        """[DEPRECATED 2026-04-26] Phase 1+2 방식은 SmartEditor ONE 인용구 변환 미동작으로 폐기.
        publish()는 _type_content_with_images / _type_content 를 사용. 롤백 시 활성화.

        Phase 1: 본문 전체를 일반 텍스트로 입력. 소제목도 인용구 없이 타이핑.

        인용구 버튼을 전혀 누르지 않으므로 커서 exit 문제가 원천 차단된다.
        소제목 정보는 heading_records로 반환하여 Phase 2에서 인용구로 변환한다.
        """
        if not self.page:
            raise RuntimeError("페이지 미초기화")

        # 서식 잔재 초기화
        await self._clear_editor_storage(frame)
        await self._reset_editor_format(frame)

        # 본문 영역 포커스
        body_area = await frame.query_selector(".se-sections .se-text-paragraph")
        if not body_area:
            body_area = await frame.evaluate_handle("""
                () => {
                    const all = document.querySelectorAll('.se-text-paragraph');
                    for (const el of all) {
                        if (!el.closest('.se-documentTitle')) return el;
                    }
                    return null;
                }
            """)
        if body_area:
            try:
                await body_area.click()
            except Exception:
                try:
                    await frame.evaluate("""
                        () => {
                            const all = document.querySelectorAll('.se-text-paragraph');
                            for (const el of all) {
                                if (!el.closest('.se-documentTitle')) {
                                    el.focus();
                                    return;
                                }
                            }
                        }
                    """)
                except Exception:
                    pass
        else:
            await self._save_error_screenshot("body_not_found")
            raise RuntimeError("본문 입력칸을 찾지 못했습니다.")

        await self._human_pause(500, 1200)

        # 마크다운 → 일반 텍스트 변환
        plain_text = self._markdown_to_plain(content)
        lines = plain_text.split("\n")

        marker_re = re.compile(r"^\s*\[이미지:\s*(.+?)\]\s*$")
        heading_re = re.compile(r'^(#{2,3})(\{(\w+)\})?\s+(.+)$')
        heading_index = 0
        heading_records: list[dict] = []

        slot_queue = list(image_slots) if image_slots else []

        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.strip()
            m = marker_re.match(line)
            heading_m = heading_re.match(stripped)

            if m and image_slots:
                # 이미지 마커 → 이미지 업로드 (기존 방식 그대로)
                slot = slot_queue.pop(0) if slot_queue else None
                if slot is None:
                    print(f"  ⚠ 마커 초과: 슬롯 부족으로 스킵 ({m.group(1)[:20]})")
                else:
                    is_first_of_pair = (
                        slot.get("group_id") and slot.get("pair_role") == "first"
                    )
                    partner = None
                    consumed_extra = 0
                    if is_first_of_pair and slot_queue:
                        j = i + 1
                        while j < len(lines) and lines[j].strip() == "":
                            j += 1
                        if j < len(lines):
                            m2 = marker_re.match(lines[j])
                            if (
                                m2
                                and slot_queue[0].get("group_id") == slot.get("group_id")
                                and slot_queue[0].get("pair_role") == "second"
                            ):
                                partner = slot_queue.pop(0)
                                consumed_extra = j - i
                    try:
                        if partner:
                            await self._insert_image_pair(
                                frame,
                                Path(slot["path"]),
                                Path(partner["path"]),
                            )
                        else:
                            await self._insert_image(frame, Path(slot["path"]))
                    except Exception as e:
                        self._image_failures += 1
                        print(f"  ⚠ 이미지 업로드 실패: {e}")
                    if consumed_extra:
                        i += consumed_extra

            elif heading_m:
                # ★ 소제목을 일반 텍스트로 타이핑 (인용구 버튼 클릭 없음!)
                explicit_style = heading_m.group(3)
                heading_text = heading_m.group(4).strip()
                next_stripped = lines[i + 1].strip() if i + 1 < len(lines) else ""
                has_image_after = bool(marker_re.match(next_stripped))
                style = resolve_heading_style(
                    self._theme, has_image_after, heading_index, explicit_style
                )

                # 섹션 경계 — 소제목 앞 Enter x4 (빈 블록 4개로 이전 섹션과 확실히 구분)
                for _ in range(4):
                    await self.page.keyboard.press("Enter")
                    await asyncio.sleep(0.08)

                # 소제목을 그냥 일반 텍스트로 타이핑
                await self._human_type(heading_text, min_delay=30, max_delay=70)
                print(f"    ✓ Phase1 소제목(텍스트): {heading_text[:30]}...")

                # Phase 2용 기록
                heading_records.append({
                    "text": heading_text,
                    "style": style,
                })
                heading_index += 1

            elif stripped:
                # 일반 본문 텍스트
                await self._human_type(line, min_delay=30, max_delay=90)

            # 다음 줄로 — 이미지 마커/소제목/빈 줄이 아닌 경우만 Enter
            # (빈 줄 스킵: 섹션 경계는 소제목 앞 Enter x4 로만 표현, 원본의 \n\n 은 무시)
            is_special = bool(m) or bool(heading_m)
            is_empty = not stripped
            if i < len(lines) - 1:
                if not is_special and not is_empty:
                    await self.page.keyboard.press("Enter")
                    await self.page.wait_for_timeout(random.randint(80, 250))

            if random.random() < 0.05:
                await self._human_pause(800, 2000)

            i += 1

        print(f"  ✓ Phase1 완료: 본문 입력 완료, heading {len(heading_records)}개 기록")
        return heading_records

    async def _convert_headings_phase2(
        self, frame: Frame, heading_records: list[dict]
    ) -> None:
        """[DEPRECATED 2026-04-26] Phase 1+2 방식은 SmartEditor ONE 인용구 변환 미동작으로 폐기.
        publish()는 _type_content_with_images / _type_content 를 사용. 롤백 시 활성화.

        Phase 2: 입력 완료 후, 소제목 paragraph를 인용구 위젯으로 역순 변환.

        역순 처리 이유: 마지막 소제목부터 변환하면, 커서가 인용구 안에 남아도
        다음 소제목(위쪽)에 영향 없음. exit 메커니즘이 불필요해진다.
        """
        if not heading_records:
            return

        print(f"  Phase2 시작: {len(heading_records)}개 소제목 → 인용구 변환 (역순)")

        for idx, record in enumerate(reversed(heading_records)):
            heading_text = record["text"]
            quote_style = record["style"]

            # 1. DOM에서 소제목 텍스트가 있는 paragraph 찾기
            #    .se-component.se-text 안의 paragraph만 검색 (이미 변환된 인용구 제외)
            para_index = await frame.evaluate("""
                (targetText) => {
                    const paras = document.querySelectorAll(
                        '.se-component.se-text .se-text-paragraph'
                    );
                    for (let i = 0; i < paras.length; i++) {
                        if (paras[i].closest('.se-documentTitle')) continue;
                        if (paras[i].textContent.trim() === targetText.trim()) {
                            return i;
                        }
                    }
                    return -1;
                }
            """, heading_text)

            if para_index < 0:
                print(f"    ⚠ Phase2: 소제목 못 찾음, 스킵: '{heading_text[:25]}'")
                continue

            # 2. 해당 paragraph 클릭 (커서 배치)
            paragraphs = await frame.query_selector_all(
                '.se-component.se-text .se-text-paragraph'
            )
            # 제목 영역 제외 필터링
            valid_paras = []
            for p in paragraphs:
                is_title = await p.evaluate("el => !!el.closest('.se-documentTitle')")
                if not is_title:
                    valid_paras.append(p)

            if para_index >= len(valid_paras):
                print(f"    ⚠ Phase2: 인덱스 초과, 스킵: '{heading_text[:25]}'")
                continue

            target_para = valid_paras[para_index]
            await target_para.click()
            await asyncio.sleep(0.5)

            # 3. 인용구 버튼 클릭 → paragraph가 인용구로 변환
            quote_btn = await frame.query_selector('button[data-name="quotation"]')
            if not quote_btn:
                quote_btn = await frame.query_selector("button.se-toolbar-button-quotation")

            if not quote_btn:
                print(f"    ⚠ Phase2: 인용구 버튼 못 찾음, 스킵: '{heading_text[:25]}'")
                continue

            await quote_btn.click(timeout=5000)
            await asyncio.sleep(1.0)

            # 4. 변환 결과 확인: 소제목 텍스트가 인용구 안에 있는지
            text_in_quote = await frame.evaluate("""
                (targetText) => {
                    const quotes = document.querySelectorAll('.se-component.se-quotation');
                    for (const q of quotes) {
                        if (q.textContent.trim().includes(targetText.trim())) {
                            return true;
                        }
                    }
                    return false;
                }
            """, heading_text)

            if text_in_quote:
                print(f"    ✓ Phase2: '{heading_text[:25]}' → 인용구 변환 성공")
            else:
                # 폴백: 빈 인용구가 생성된 경우 → 텍스트 타이핑
                print(f"    ⚠ Phase2: paragraph 변환 안 됨, 빈 인용구에 직접 타이핑")
                await self.page.keyboard.type(heading_text, delay=random.randint(10, 25))
                await asyncio.sleep(0.5)

            # 5. 스타일 변경
            if quote_style != "default":
                await self._apply_style_to_last_quotation(frame, quote_style)

            await asyncio.sleep(0.3)

        print(f"  ✓ Phase2 완료: 인용구 변환 종료")

    async def _apply_style_to_last_quotation(self, frame: Frame, style: str) -> None:
        """[DEPRECATED 2026-04-26] Phase 2 전용 헬퍼. publish() 미사용. 롤백 시 활성화.

        방금 생성/변환된 인용구의 스타일을 변경한다."""
        style_value_map = {
            "line": "quotation_line",
            "bubble": "quotation_bubble",
            "underline": "quotation_underline",
            "postit": "quotation_postit",
            "corner": "quotation_corner",
        }
        target_value = style_value_map.get(style)
        if not target_value:
            return

        selector = f'button[data-name="quotation-layout"][data-value="{target_value}"]'

        # 시도 1: 방금 변환된 인용구가 선택 상태 → 속성 툴바가 이미 표시되어 있을 수 있음
        try:
            style_btn = await frame.wait_for_selector(selector, timeout=2000, state="visible")
            if style_btn:
                await style_btn.click(timeout=3000)
                await asyncio.sleep(0.4)
                print(f"      스타일 변경: {style}")
                return
        except Exception:
            pass

        # 시도 2: 마지막 인용구를 클릭 → 툴바 대기 → 버튼 클릭
        try:
            quotations = await frame.query_selector_all(".se-component.se-quotation")
            if quotations:
                last_q = quotations[-1]
                await last_q.click(timeout=3000)
                await asyncio.sleep(0.5)

                style_btn = await frame.wait_for_selector(selector, timeout=3000, state="visible")
                if style_btn:
                    await style_btn.click(timeout=3000)
                    await asyncio.sleep(0.4)
                    print(f"      스타일 변경(재클릭): {style}")
                    return
        except Exception:
            pass

        # 시도 3: JS className 폴백
        target_class = QUOTE_STYLES.get(style, "se-l-default")
        try:
            result = await frame.evaluate(f"""
                () => {{
                    const quotes = document.querySelectorAll('.se-component.se-quotation');
                    const q = quotes[quotes.length - 1];
                    if (!q) return 'no quotation';
                    q.className = q.className.replace(/se-l-[\\w]+/, '{target_class}');
                    return 'ok';
                }}
            """)
            if result == "ok":
                print(f"      스타일 변경(JS폴백): {style}")
        except Exception as e:
            print(f"      ⚠ 스타일 변경 실패: {str(e)[:60]}")

    # ===== SmartEditor ONE 이미지 업로드 =====
    async def _OLD_insert_image(self, frame: Frame, image_path: Path):
        """[DEPRECATED 2026-04-26] 옛 단일 이미지 삽입. publish() 미사용 (새 _insert_image 사용)."""
        if not self.page:
            return
        try:
            # 이미지 버튼 찾기 (다중 셀렉터 후보)
            img_btn = None
            for sel in [
                'button[data-name="image"]',
                'button.se-image-toolbar-button',
                'button[title*="이미지"]',
            ]:
                img_btn = await frame.query_selector(sel)
                if img_btn:
                    break
            if not img_btn:
                raise RuntimeError("이미지 업로드 버튼을 찾지 못함")

            async with self.page.expect_file_chooser(timeout=10000) as fc_info:
                await img_btn.click()
            file_chooser = await fc_info.value
            await file_chooser.set_files(str(image_path))
            await asyncio.sleep(3)  # 업로드 완료 대기
            # 이미지 뒤로 커서 이동 (End 키)
            await self.page.keyboard.press("End")
            await self.page.wait_for_timeout(300)
            print(f"    ✓ 이미지 삽입: {image_path.name}")
        except Exception as e:
            raise RuntimeError(f"이미지 삽입 실패 ({image_path.name}): {e}")

    async def _OLD_insert_image_pair(
        self, frame: Frame, path1: Path, path2: Path
    ):
        """[DEPRECATED 2026-04-26] 옛 페어 이미지 삽입. publish() 미사용 (페어 → 위아래 단일로 폴백)."""
        if not self.page:
            return
        try:
            img_btn = None
            for sel in [
                'button[data-name="image"]',
                'button.se-image-toolbar-button',
                'button[title*="이미지"]',
            ]:
                img_btn = await frame.query_selector(sel)
                if img_btn:
                    break
            if not img_btn:
                raise RuntimeError("이미지 업로드 버튼을 찾지 못함")

            async with self.page.expect_file_chooser(timeout=10000) as fc_info:
                await img_btn.click()
            file_chooser = await fc_info.value
            await file_chooser.set_files([str(path1), str(path2)])
            await asyncio.sleep(4)
            await self.page.keyboard.press("End")
            await self.page.wait_for_timeout(300)
            print(f"    ✓ 이미지 페어 삽입: {path1.name} + {path2.name}")
        except Exception as e:
            print(f"    ⚠ 페어 업로드 실패 — 순차 업로드로 폴백 ({e})")
            try:
                await self._insert_image(frame, path1)
                await self._insert_image(frame, path2)
            except Exception as e2:
                raise RuntimeError(f"페어 이미지 삽입 실패: {e2}")

    # ============================================================
    # ===== 본문 입력 시스템 (App_blog_auto3 이식, 2026-04-26) =====
    # ============================================================
    # 검증된 발행 봇(BlogPublisher.app으로 빌드된 App_blog_auto3)의
    # 본문 입력 로직을 통째로 이식한 영역.
    #
    # 핵심 노하우:
    # 1) 인용구 텍스트는 키보드 typing이 아닌 JS DOM 직접 조작
    #    (span.textContent + placeholder 제거 + se-is-empty 클래스 제거 + InputEvent dispatch)
    # 2) 스타일 변경은 인용구 exit 후에 적용 (exit 전이면 SmartEditor 재렌더로 텍스트 초기화)
    # 3) className만 변경, change 이벤트 dispatch 금지 (재렌더 방지)
    # 4) 가독성: _split_for_readability로 3문장마다 자동 빈 줄
    # ============================================================

    async def _insert_empty_line(self):
        """빈 줄(Enter) 1번"""
        if not self.page:
            return
        await self.page.keyboard.press("Enter")
        await asyncio.sleep(0.1)

    async def _is_editor_alive(self, frame: Frame) -> bool:
        """SmartEditor가 살아있는지(frame이 detach되지 않고 .se-content가 존재하는지) 확인.

        흰 화면(chrome-error://chromewebdata/) 사고 방지용 health check.
        """
        try:
            result = await frame.evaluate(
                "() => document.querySelector('.se-content') !== null"
            )
            return bool(result)
        except Exception:
            return False

    async def _exit_quotation(self, frame: Frame):
        """인용구 밖으로 나가기 — 인용구 바로 아래에 커서 배치.

        핵심: 마지막 paragraph가 아닌, 현재 인용구 컴포넌트의 바로 아래로 이동.
        방법: 인용구 컴포넌트의 bounding box 아래쪽을 클릭.
        """
        try:
            quotations = await frame.query_selector_all('.se-component.se-quotation')
            if quotations:
                last_quote = quotations[-1]
                box = await last_quote.bounding_box()
                if box:
                    click_x = box["x"] + box["width"] * 0.5
                    click_y = box["y"] + box["height"] + 20
                    await self.page.mouse.click(click_x, click_y)
                    await asyncio.sleep(0.5)
                    return True
        except Exception:
            pass

        try:
            content_area = await frame.query_selector('.se-content')
            if content_area:
                box = await content_area.bounding_box()
                if box:
                    click_x = box["x"] + box["width"] * 0.5
                    click_y = box["y"] + box["height"] - 10
                    await self.page.mouse.click(click_x, click_y)
                    await asyncio.sleep(0.5)
                    return True
        except Exception:
            pass

        # 최종 폴백: ArrowDown 반복으로 이동
        for _ in range(5):
            await self.page.keyboard.press("ArrowDown")
            await asyncio.sleep(0.1)
        await self.page.keyboard.press("End")
        await asyncio.sleep(0.2)
        return False

    async def _click_below_component(self, frame: Frame):
        """현재 컴포넌트(이미지/구분선 등) 아래로 커서 이동"""
        try:
            content_area = await frame.query_selector('.se-content')
            if content_area:
                box = await content_area.bounding_box()
                if box:
                    click_x = box["x"] + box["width"] * 0.5
                    click_y = box["y"] + box["height"] - 10
                    await self.page.mouse.click(click_x, click_y)
                    await asyncio.sleep(0.5)
                    return
        except Exception:
            pass
        for _ in range(3):
            await self.page.keyboard.press("ArrowDown")
            await asyncio.sleep(0.1)
        await self.page.keyboard.press("End")

    async def _change_quotation_style(self, frame: Frame, style: str):
        """삽입된 인용구의 스타일을 JavaScript로 변경.

        네이버 SmartEditor ONE 인용구 6종 (postit 추가):
        - default: 큰따옴표
        - quotation_bubble: 말풍선
        - quotation_line: 세로선
        - quotation_underline: 밑줄
        - quotation_corner: 모서리 꺾쇠
        - quotation_postit: 포스트잇

        ★ 핵심: className만 변경. change 이벤트 보내면 SmartEditor가 재렌더링하며 텍스트 초기화됨.
        """
        style_class_map = {
            "default": "se-l-default",
            "bubble": "se-l-quotation_bubble",
            "line": "se-l-quotation_line",
            "underline": "se-l-quotation_underline",
            "corner": "se-l-quotation_corner",
            "postit": "se-l-quotation_postit",
        }
        target_class = style_class_map.get(style, "se-l-default")
        if target_class == "se-l-default":
            return  # 기본 스타일이면 변경 불필요

        result = await frame.evaluate(f"""
            () => {{
                const quotes = document.querySelectorAll('.se-component.se-quotation');
                const q = quotes[quotes.length - 1];
                if (!q) return 'no quotation';

                // 컴포넌트 래퍼의 레이아웃 클래스만 변경 (이벤트 디스패치 금지!)
                // change 이벤트를 보내면 SmartEditor가 재렌더링하며 텍스트가 초기화됨
                q.className = q.className.replace(/se-l-[\\w]+/, '{target_class}');

                return 'ok';
            }}
        """)
        if result == 'ok':
            print(f"      스타일 변경: {style}")
        else:
            print(f"      ⚠ 스타일 변경 실패({result})")

    # ============================================================
    # ===== 인용구 위젯 삽입 — 4중 안전망 (2026-04-26 강화) =====
    # ============================================================
    # 빈 인용구("내용을 입력하세요." placeholder 노출) 문제 4가지 원인 대응:
    # 1) quotes[length-1] race condition → 클릭 전후 개수 폴링으로 신규 인용구 확정
    # 2) JS textContent 주입이 React state와 미동기화 → 공백+백스페이스로 강제 onInput 트리거
    # 3) 검증 단계 부재 → 주입 후 textContent 재확인, isEmpty 클래스 확인
    # 4) silent failure → 검증 실패 시 마지막 인용구 클릭 + 키보드 typing 폴백
    # ============================================================

    async def _insert_quotation_with_text(
        self, frame: Frame, text: str, label: str = "인용구"
    ) -> bool:
        """[DEPRECATED 2026-04-26] 인용구 위젯 시도 자체를 폐기.
        publish()는 굵은 글씨 방식 사용 (_insert_heading/_insert_quote 단순화 버전).
        롤백 시 활성화. 미호출.

        인용구 위젯 + 텍스트 주입 + 검증 + 키보드 폴백.

        Returns: True (성공) / False (인용구 위젯 자체 미생성 — 호출부에서 볼드 폴백 필요)
        """
        # ─── 1단계: race 방지 — 클릭 전 인용구 개수 기록 ───
        before_count = await frame.evaluate(
            "() => document.querySelectorAll('.se-component.se-quotation').length"
        )

        # ─── 2단계: 인용구 버튼 클릭 ───
        quote_btn = await frame.query_selector('button[data-name="quotation"]')
        if not quote_btn:
            quote_btn = await frame.query_selector('button.se-toolbar-button-quotation')
        if not quote_btn:
            print(f"    ⚠ {label} 인용구 버튼 없음")
            return False

        try:
            await quote_btn.click(timeout=5000)
        except Exception as e:
            print(f"    ⚠ {label} 인용구 버튼 클릭 실패: {str(e)[:60]}")
            return False

        # ─── 3단계: 새 인용구 DOM 추가될 때까지 폴링 (최대 4초) ───
        added = False
        for _ in range(20):
            await asyncio.sleep(0.2)
            cur_count = await frame.evaluate(
                "() => document.querySelectorAll('.se-component.se-quotation').length"
            )
            if cur_count == before_count + 1:
                added = True
                break
        if not added:
            print(f"    ⚠ {label} 새 인용구 DOM 추가 안 됨 (race)")
            # 실패해도 마지막 인용구에 키보드 폴백 시도 (이전 인용구 덮어쓰지 않으려면 위험하므로 fail)
            return False

        # ─── 4단계: JS DOM 직접 주입 ───
        escaped = text.replace("\\", "\\\\").replace("'", "\\'")
        inject = await frame.evaluate(f"""
            () => {{
                const quotes = document.querySelectorAll('.se-component.se-quotation');
                const q = quotes[quotes.length - 1];
                if (!q) return 'no_q';
                const span = q.querySelector('.se-quote .se-text-paragraph span.__se-node');
                if (!span) return 'no_span';
                span.textContent = '{escaped}';
                const ph = q.querySelector('.se-quote .se-placeholder');
                if (ph) ph.remove();
                const mod = q.querySelector('.se-quote');
                if (mod) mod.classList.remove('se-is-empty');
                const para = q.querySelector('.se-quote .se-text-paragraph');
                if (para) para.dispatchEvent(new InputEvent('input', {{bubbles:true, inputType:'insertText', data:'{escaped}'}}));
                return 'ok';
            }}
        """)

        if inject != 'ok':
            print(f"    ⚠ {label} JS 주입 실패({inject}) → 키보드 폴백")
            return await self._fallback_keyboard_into_last_quote(frame, text, label)

        # ─── 5단계 [REMOVED 2026-04-26]: React state 강제 갱신 (공백+Backspace) ───
        # 이전 시도: keyboard.type(' ') + keyboard.press('Backspace')
        # 제거 사유: SmartEditor가 reconciliation 중인 상태에서 Backspace 입력이 들어가
        #          인용구 컴포넌트를 unmount → 페이지 reload 유발 (흰 화면 사고)
        # 대신: React reconciliation이 끝날 때까지 충분히 대기 (1초)
        await asyncio.sleep(1.0)

        # ─── 6단계: 검증 — 진짜로 텍스트가 있고 isEmpty가 아닌지 ───
        verify_json = await frame.evaluate("""
            () => {
                const quotes = document.querySelectorAll('.se-component.se-quotation');
                const q = quotes[quotes.length - 1];
                if (!q) return JSON.stringify({text: '', isEmpty: true});
                const para = q.querySelector('.se-quote .se-text-paragraph');
                const t = para ? (para.textContent || '').trim() : '';
                const mod = q.querySelector('.se-quote');
                const isEmpty = mod ? mod.classList.contains('se-is-empty') : true;
                return JSON.stringify({text: t, isEmpty: isEmpty});
            }
        """)

        import json as _json
        try:
            verify = _json.loads(verify_json) if verify_json else {"text": "", "isEmpty": True}
        except Exception:
            verify = {"text": "", "isEmpty": True}

        if not verify.get("text") or verify.get("isEmpty"):
            print(f"    ⚠ {label} 검증 실패 (text={verify.get('text', '')[:20]!r}, isEmpty={verify.get('isEmpty')}) → 키보드 폴백")
            return await self._fallback_keyboard_into_last_quote(frame, text, label)

        return True

    async def _fallback_keyboard_into_last_quote(
        self, frame: Frame, text: str, label: str = "인용구"
    ) -> bool:
        """[DEPRECATED 2026-04-26] 인용구 위젯 폐기로 미호출. 롤백 시 활성화.

        마지막 인용구 클릭 → 실제 키보드 타이핑 (React onInput 정상 트리거).
        Meta+A + Delete 제거됨: 페이지 전체 selection 위험.
        """
        try:
            quotations = await frame.query_selector_all('.se-component.se-quotation')
            if not quotations:
                print(f"    ⚠ {label} 키보드 폴백: 인용구 노드 없음")
                return False
            last_q = quotations[-1]
            # 인용구 안의 paragraph 직접 클릭 (focus 보장)
            target = await last_q.query_selector('.se-quote .se-text-paragraph')
            if target is None:
                target = last_q
            await target.click()
            await asyncio.sleep(0.3)
            # 실제 키보드 타이핑만 수행 (Meta+A + Delete 제거 — 페이지 깨뜨림 위험)
            await self.page.keyboard.type(text, delay=random.randint(10, 25))
            await asyncio.sleep(0.3)
            print(f"    ✓ {label}(키보드 폴백): {text[:30]}...")
            return True
        except Exception as e:
            print(f"    ⚠ {label} 키보드 폴백 실패: {str(e)[:60]}")
            return False

    # ============================================================
    # ===== 인용구 위젯 단순 시도 (Phase 1 — 첫 번째 소제목 1개만) =====
    # ============================================================

    async def _try_quotation_widget(
        self, frame: Frame, text: str, quote_style: str = "line"
    ) -> bool:
        """인용구 위젯 1회 시도 (단순/안전 버전).

        Returns:
            True: 인용구 박스에 텍스트 정상 입력됨
            False: 어떤 단계에서 실패 — 호출부에서 굵은 글씨 폴백 필요

        안전 보장:
        - 위험 키 (Backspace/Meta+A/Delete) 절대 사용 안 함 → 페이지 안 깨뜨림
        - frame.evaluate 호출 최소 (count, polling, inject, verify)
        - 검증은 read-only DOM 쿼리만
        - 실패 후에도 페이지 살아있어 굵은 글씨 폴백 가능
        """
        # 1. 클릭 전 인용구 개수 (race 방지)
        before = await frame.evaluate(
            "() => document.querySelectorAll('.se-component.se-quotation').length"
        )

        # 2. 인용구 버튼 클릭
        btn = await frame.query_selector('button[data-name="quotation"]')
        if not btn:
            print(f"      [try_quote] 인용구 버튼 없음")
            return False
        try:
            await btn.click(timeout=3000)
        except Exception as e:
            print(f"      [try_quote] 버튼 클릭 실패: {str(e)[:60]}")
            return False

        # 3. 새 인용구 추가 폴링 (최대 3초, 0.3초 간격)
        added = False
        for _ in range(10):
            await asyncio.sleep(0.3)
            cur = await frame.evaluate(
                "() => document.querySelectorAll('.se-component.se-quotation').length"
            )
            if cur == before + 1:
                added = True
                break
        if not added:
            print(f"      [try_quote] 새 인용구 DOM 추가 안 됨 (race)")
            return False

        # 4. JS 텍스트 주입 (App_blog_auto3 검증 패턴)
        escaped = text.replace("\\", "\\\\").replace("'", "\\'")
        inject_ok = await frame.evaluate(f"""
            () => {{
                const quotes = document.querySelectorAll('.se-component.se-quotation');
                const q = quotes[quotes.length - 1];
                if (!q) return false;
                const span = q.querySelector('.se-quote .se-text-paragraph span.__se-node');
                if (!span) return false;
                span.textContent = '{escaped}';
                const ph = q.querySelector('.se-quote .se-placeholder');
                if (ph) ph.remove();
                const mod = q.querySelector('.se-quote');
                if (mod) mod.classList.remove('se-is-empty');
                const para = q.querySelector('.se-quote .se-text-paragraph');
                if (para) para.dispatchEvent(new InputEvent('input', {{
                    bubbles:true, inputType:'insertText', data:'{escaped}'
                }}));
                return true;
            }}
        """)
        if not inject_ok:
            print(f"      [try_quote] JS 주입 실패")
            return False

        # 5. React 동기화 대기 (위험 키 없이 그냥 1.5초 대기)
        await asyncio.sleep(1.5)

        # 6. 검증 (read-only)
        has_text = await frame.evaluate("""
            () => {
                const quotes = document.querySelectorAll('.se-component.se-quotation');
                const q = quotes[quotes.length - 1];
                if (!q) return false;
                const para = q.querySelector('.se-quote .se-text-paragraph');
                const t = para ? (para.textContent || '').trim() : '';
                return t.length > 0;
            }
        """)
        if not has_text:
            print(f"      [try_quote] 검증 실패 — 인용구 비어있음")
            return False

        # 7. exit + 스타일 변경
        try:
            await self._exit_quotation(frame)
            await asyncio.sleep(0.3)
            await self._change_quotation_style(frame, quote_style)
            await asyncio.sleep(0.3)
        except Exception as e:
            print(f"      [try_quote] exit/style 실패: {str(e)[:60]}")
            return False

        # 8. health check (페이지 살아있는지 최종 확인)
        if not await self._is_editor_alive(frame):
            print(f"      [try_quote] health check 실패 — 페이지 깨짐 감지")
            return False

        return True

    async def _insert_heading(self, frame: Frame, text: str, quote_style: str = "line"):
        """소제목 삽입 — Phase 2: 모든 소제목에 대해 독립적으로 인용구 박스 시도.

        ★ 2026-04-28 Phase 2 도입:
          - 모든 소제목에 인용구 박스 시도 (Phase 1의 첫 소제목 게이트 제거)
          - 각 시도는 독립적: 한 곳이 실패해도 그 소제목만 굵은 글씨 폴백,
            다음 소제목은 다시 인용구 시도
          - `_try_quotation_widget` 자체가 위험 키 미사용 + health check 내장으로
            매 시도가 페이지 안전을 자체 보장
        """
        # 소제목 전 여백
        await self._insert_empty_line()
        await self._insert_empty_line()

        # ─── 모든 소제목에 대해 독립적으로 인용구 박스 시도 ───
        success = await self._try_quotation_widget(frame, text, quote_style)
        if success:
            print(f"    ✓ 소제목 #{self._heading_count + 1}(인용구/{quote_style}): {text[:30]}...")
            self._heading_count += 1
            return

        # ─── 실패 시 그 소제목만 굵은 글씨 폴백 (다음 소제목은 다시 시도) ───
        print(f"    ⚠ 소제목 #{self._heading_count + 1} 인용구 실패 → 굵은 글씨 폴백: {text[:30]}")
        await self.page.keyboard.press("Meta+b")
        await asyncio.sleep(0.1)
        await self._human_type(text, min_delay=5, max_delay=12)
        await asyncio.sleep(0.2)
        await self.page.keyboard.press("Meta+b")
        await asyncio.sleep(0.1)
        await self.page.keyboard.press("Enter")
        await self._insert_empty_line()
        self._heading_count += 1

    async def _insert_quote(self, frame: Frame, text: str, quote_style: str = "default"):
        """본문 인용구 삽입 — 굵은 글씨 + 위아래 여백 (안정성 우선).

        ★ 2026-04-26: _insert_heading과 동일 이유로 인용구 위젯 미사용.
        quote_style 인자는 호환성 위해 받지만 사용 안 함.
        """
        # 위아래 여백으로 시각적 분리
        await self._insert_empty_line()
        await self._insert_empty_line()

        # 굵은 글씨로 강조
        await self.page.keyboard.press("Meta+b")
        await asyncio.sleep(0.1)
        await self._human_type(text, min_delay=5, max_delay=12)
        await asyncio.sleep(0.2)
        await self.page.keyboard.press("Meta+b")
        await asyncio.sleep(0.1)
        await self.page.keyboard.press("Enter")

        # 인용구 후 여백
        await self._insert_empty_line()

        print(f"    ✓ 인용구(굵은 글씨): {text[:30]}...")

    async def _insert_image(self, frame: Frame, image_path: Path):
        """이미지 삽입 + 전후 여백 (App_blog_auto3 방식)"""
        await self._insert_empty_line()

        try:
            img_btn = await frame.query_selector('button[data-name="image"]')
            if not img_btn:
                img_btn = await frame.query_selector("button.se-image-toolbar-button")

            if img_btn:
                async with self.page.expect_file_chooser(timeout=10000) as fc_info:
                    await img_btn.click()
                file_chooser = await fc_info.value
                await file_chooser.set_files(str(image_path))
                await asyncio.sleep(3)

                # 이미지 삽입 후 본문 영역으로 돌아가기
                await self._click_below_component(frame)
                print(f"    ✓ 이미지: {image_path.name}")
            else:
                print("    ⚠ 이미지 버튼 없음")
                self._image_failures += 1
        except Exception as e:
            print(f"    ⚠ 이미지 실패: {e}")
            self._image_failures += 1

        await self._insert_empty_line()

    async def _insert_horizontal_rule(self, frame: Frame):
        """구분선(수평선) 삽입 — 빈 줄 3개로 시각적 섹션 구분"""
        await self._insert_empty_line()
        await self._insert_empty_line()
        await self._insert_empty_line()
        print("    ✓ 구분선 (섹션 구분 여백)")

    def _split_for_readability(self, text: str) -> list[str]:
        """가독성 기반 줄바꿈 분리.

        규칙 (우선순위 순):
        1. 마침표/느낌표/물음표 뒤 → 줄바꿈
        2. 구어체 종결(~요, ~죠, ~거든, ~는데, ~음, ~임) 뒤 공백 → 줄바꿈
        3. 20자 이상 진행 후 쉼표(,) → 줄바꿈
        4. 5자 미만 조각은 앞 줄에 병합
        """
        # 1차: 마침표/느낌표/물음표 뒤 공백 기준 분리
        chunks = re.split(r'(?<=[.!?])\s+', text)

        # 2차: 각 조각에서 구어체 종결어미 뒤 공백 기준 추가 분리
        ENDINGS = (
            '거든요', '잖아요', '했어요', '됐어요', '같아요', '봤어요',
            '있어요', '없어요', '했는데', '인데요', '는데요', '든요',
            '거든', '잖아', '죠',
        )
        expanded = []
        for chunk in chunks:
            parts = []
            remaining = chunk
            while remaining:
                best_pos = -1
                for ending in ENDINGS:
                    idx = remaining.find(ending)
                    if idx >= 0:
                        end_pos = idx + len(ending)
                        if end_pos < len(remaining) and remaining[end_pos] == ' ':
                            if best_pos < 0 or end_pos < best_pos:
                                best_pos = end_pos
                if best_pos >= 0:
                    parts.append(remaining[:best_pos].strip())
                    remaining = remaining[best_pos:].strip()
                else:
                    parts.append(remaining.strip())
                    break
            expanded.extend(p for p in parts if p)

        # 3차: 긴 조각(20자 이상)에서 쉼표 뒤 공백 기준 추가 분리
        result = []
        for chunk in expanded:
            if len(chunk) >= 20 and ',' in chunk:
                sub_parts = re.split(r',\s+', chunk)
                rebuilt = []
                for j, sp in enumerate(sub_parts):
                    if j < len(sub_parts) - 1:
                        rebuilt.append(sp + ',')
                    else:
                        rebuilt.append(sp)
                merged = []
                for sp in rebuilt:
                    if merged and len(sp.strip()) < 5:
                        merged[-1] = merged[-1] + ' ' + sp
                    else:
                        merged.append(sp)
                result.extend(merged)
            else:
                result.append(chunk)

        # 4차: 빈 문자열 제거 + 최종 5자 미만 병합
        final = []
        for line in result:
            line = line.strip()
            if not line:
                continue
            if final and len(line) < 5:
                final[-1] = final[-1] + ' ' + line
            else:
                final.append(line)

        return final if final else [text]

    async def _input_body(self, frame: Frame, blocks, image_paths: list[Path]):
        """본문 블록별 입력 — App_blog_auto3 검증 로직.

        blocks: parse_markdown()이 반환한 ContentBlock 리스트
        image_paths: 마커 순서대로 정렬된 이미지 파일 경로 리스트

        참조 블로그 패턴: 소제목(인용구) → 빈줄 → 이미지 → 빈줄 → 본문 2~3줄 → 빈줄 반복

        ★ 본문 입력 전: _reset_editor_format으로 취소선/볼드 등 토글 OFF
          이전 세션 잔여 서식(특히 _dismiss_popups가 잘못 누른 취소선) 정화
        ★ 본문 입력 후: _cleanup_body_strikethrough로 DOM에 남은 취소선 제거
        """
        # ContentBlock 임포트 (지연 임포트로 순환 참조 방지)
        from core.markdown_converter import BlockType

        # ★ 본문 입력 전 서식 초기화 (App_blog_auto3 원본 패턴 — 취소선 ON 방어)
        await self._reset_editor_format(frame)

        # 본문 영역 포커스 (App_blog2 방식 — 검증된 본문 클릭 로직)
        body_area = await frame.query_selector(".se-sections .se-text-paragraph")
        if not body_area:
            body_area = await frame.evaluate_handle("""
                () => {
                    const all = document.querySelectorAll('.se-text-paragraph');
                    for (const el of all) {
                        if (!el.closest('.se-documentTitle')) return el;
                    }
                    return null;
                }
            """)
        if body_area:
            try:
                await body_area.click()
            except Exception:
                try:
                    await frame.evaluate("""
                        () => {
                            const all = document.querySelectorAll('.se-text-paragraph');
                            for (const el of all) {
                                if (!el.closest('.se-documentTitle')) {
                                    el.focus();
                                    return;
                                }
                            }
                        }
                    """)
                except Exception:
                    pass
        else:
            await self._save_error_screenshot("body_not_found")
            raise RuntimeError("본문 입력칸을 찾지 못했습니다.")

        await asyncio.sleep(0.3)

        image_idx = 0
        total = len(blocks)

        for i, block in enumerate(blocks):
            if block.type == BlockType.PARAGRAPH:
                # ★ App_blog2는 Gemini가 이미 "한 줄에 한 문장" 으로 만들어주므로
                #   _split_for_readability 같은 추가 분리 불필요 (오히려 1줄1빈줄 과다 줄바꿈 유발).
                #   markdown_converter가 합쳐놓은 \n을 그대로 풀어서 줄 단위로 입력.
                lines = [ln.strip() for ln in block.text.split('\n') if ln.strip()]
                for line in lines:
                    await self._human_type(line, min_delay=3, max_delay=8)
                    await self.page.keyboard.press("Enter")
                    await asyncio.sleep(0.1)
                # 문단 사이 여백 1줄 (다음 PARAGRAPH/HEADING 와 시각 분리)
                await self._insert_empty_line()

            elif block.type == BlockType.HEADING:
                # 마크다운 명시 스타일 우선, 없으면 테마 스타일 적용
                heading_style = getattr(block, 'quote_style', None)
                if not heading_style or heading_style == 'default':
                    # App_blog2 테마에서 소제목 스타일 가져옴
                    heading_style = self._theme.get('heading_quote', 'line')
                await self._insert_heading(frame, block.text, quote_style=heading_style)

            elif block.type == BlockType.IMAGE:
                if image_idx < len(image_paths):
                    await self._insert_image(frame, image_paths[image_idx])
                    image_idx += 1
                else:
                    print(f"    ⚠ 이미지 슬롯 부족 (블록 {i}, 마커: {block.text[:30]})")

            elif block.type == BlockType.QUOTE:
                q_style = getattr(block, 'quote_style', None)
                if not q_style or q_style == 'default':
                    q_style = self._theme.get('heading_quote_secondary', 'default')
                await self._insert_quote(frame, block.text, quote_style=q_style)

            elif block.type == BlockType.HORIZONTAL_RULE:
                await self._insert_horizontal_rule(frame)

            # 진행률 표시
            if (i + 1) % 5 == 0 or i == total - 1:
                print(f"    진행: {i + 1}/{total}")

            # ★ 페이지 health check (10블록마다) — 흰 화면 사고 방지
            if i > 0 and i % 10 == 0:
                if not await self._is_editor_alive(frame):
                    print(f"  ⚠ SmartEditor 응답 없음 (블록 {i}/{total}). 발행 중단.")
                    raise RuntimeError(
                        f"SmartEditor 페이지가 깨졌습니다 (블록 {i}/{total}에서 감지). "
                        "Chrome 창을 닫고 다시 시도해주세요."
                    )

            # 자연스러운 딜레이
            if i % 3 == 0:
                await asyncio.sleep(random.uniform(0.2, 0.6))

        print("    ✓ 본문 입력 완료")

        # ★ 본문 입력 후 DOM 정화 (App_blog2 안전망 — 만에 하나 남은 취소선 태그/스타일 제거)
        await self._cleanup_body_strikethrough(frame)

    # ===== 발행 버튼 (iframe+page 양쪽 탐색, App_blog_auto3 기반) =====
    async def _publish(self):
        if not self.page:
            return

        await self._human_pause(1500, 3500)

        publish_btn = None

        # 모든 프레임에서 발행 버튼 탐색
        for f in self.page.frames:
            for selector in [
                'button[class*="publish_btn"]',
                '[class*="publish_btn"] button',
                'button:has-text("발행")',
            ]:
                try:
                    btn = await f.query_selector(selector)
                    if btn:
                        text = await btn.evaluate("el => el.textContent?.trim() || ''")
                        if "발행" in text and "예약" not in text:
                            publish_btn = btn
                            break
                except Exception:
                    continue
            if publish_btn:
                break

        if publish_btn:
            await publish_btn.click()
            print("  ✓ 발행 버튼 클릭")
        else:
            await self._save_error_screenshot("publish_btn_not_found")
            raise RuntimeError("발행 버튼을 찾을 수 없습니다.")

        await asyncio.sleep(3)

        # 발행 확인 다이얼로그
        for f in self.page.frames:
            try:
                confirm_btn = await f.query_selector(
                    'button:has-text("발행"), button:has-text("확인")'
                )
                if confirm_btn and await confirm_btn.is_visible():
                    await confirm_btn.click()
                    print("  ✓ 발행 확인 클릭")
                    await asyncio.sleep(5)
                    break
            except Exception:
                continue

    # ===== 전체 발행 프로세스 =====
    async def publish(
        self,
        title: str,
        content: str,
        naver_id: str = "",
        naver_pw: str = "",
        profile_path: str = "",
        image_slots: list[dict] | None = None,
        auto_publish: bool = True,
    ) -> dict:
        """네이버 블로그 발행.

        Args:
            title: 글 제목
            content: 마크다운 본문 ([이미지: ...] 마커 포함 가능)
            naver_id, naver_pw: 로그인 정보
            profile_path: 계정별 Chrome 프로필 경로
            image_slots: 이미지 슬롯 (있으면 마커 위치에 업로드).
                각 dict: {slot_id, description, group_id, pair_role, path}
        """
        counter_data = _load_counter()
        self._image_failures = 0
        self._heading_count = 0

        # 테마 랜덤 선택 + 본문 인용구 선제 제거
        self._theme = pick_formatting_theme()
        content = strip_body_quotes(content)

        try:
            print("=" * 60)
            print(f"🚀 네이버 블로그 발행 시작 ({naver_id or '수동 로그인'})")
            print(f"   🎨 테마: {self._theme['name']} (소제목: {self._theme['heading_quote']}/{self._theme['heading_quote_secondary']})")
            if image_slots:
                print(f"   이미지 {len(image_slots)}장 포함")
            print("=" * 60)

            # 1. 브라우저 실행 (계정별 프로필)
            await self._launch_browser(profile_path=profile_path)
            print("  ✓ 브라우저 실행 완료")

            # 2. 에디터 진입 (자동 로그인 포함)
            await self._navigate_to_editor(naver_id=naver_id, naver_pw=naver_pw)
            print("  ✓ 에디터 페이지 이동 완료")

            # 3. ★ iframe 대기 (핵심!)
            frame = await self._wait_for_editor_frame(30)

            # 4. 팝업 닫기 (2회 시도)
            await self._dismiss_popups(frame)
            await asyncio.sleep(1)
            await self._dismiss_popups(frame)

            # 5. 제목 입력
            await self._type_title(title)
            await self._human_pause(500, 1500)

            # 6. 본문 입력 (App_blog_auto3 방식: 마크다운 → 블록 파싱 → 블록별 입력)
            from core.markdown_converter import parse_markdown
            sequence = parse_markdown(content)
            # image_slots(dict 리스트) → image_paths(Path 리스트) 어댑터
            # publish 라우터가 마커 순서대로 정렬해서 전달함
            image_paths = [Path(slot["path"]) for slot in (image_slots or [])]
            print(f"  📦 블록: {len(sequence.blocks)}개, 이미지: {len(image_paths)}장")
            await self._input_body(frame, sequence.blocks, image_paths)

            # 7. 발행 — auto_publish 에 따라 분기
            if auto_publish:
                await self._publish()
                current_url = self.page.url if self.page else ""
                _increment_counter(counter_data)
                mode_msg = "published"
                today_count = counter_data["count"] + 1

                print("=" * 60)
                print("✅ 발행 완료!")
                if self._image_failures > 0:
                    print(f"⚠ 이미지 {self._image_failures}장 업로드 실패 (해당 자리 공백)")
                print("=" * 60)
            else:
                current_url = ""
                mode_msg = "awaiting_manual_publish"
                today_count = counter_data["count"]  # 실제 발행 여부 불확실 → 증가 안 함

                print("━" * 60)
                print("📝 글 작성 완료 — 브라우저에서 직접 '발행' 버튼을 눌러주세요")
                if self._image_failures > 0:
                    print(f"⚠ 이미지 {self._image_failures}장 업로드 실패 (해당 자리 공백)")
                print("━" * 60)

            return {
                "url": current_url,
                "success": True,
                "mode": mode_msg,
                "today_count": today_count,
                "image_failures": self._image_failures,
            }
        except Exception as e:
            await self._save_error_screenshot("publish_failed")
            raise RuntimeError(f"네이버 블로그 발행 실패: {str(e)}")
        finally:
            if self.browser:
                if auto_publish:
                    await self.browser.close()
                else:
                    # Chrome 열어둠 — GC 방지 위해 모듈 리스트에 (pw, browser) 참조 유지
                    _detached_contexts.append((self._pw, self.browser))
                    print(f"  (열린 Chrome {len(_detached_contexts)}개 유지 중)")
