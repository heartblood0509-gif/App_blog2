"""
네이버 블로그 자동 포스팅 봇
App_blog_auto2/bots/naver_blog_publisher.py 기반으로 구현
Playwright를 사용하여 SmartEditor ONE에 글을 작성합니다.
"""

import asyncio
import re
from playwright.async_api import async_playwright, Page, Browser
from config import CHROME_USER_DATA_DIR, CHROME_PROFILE


class NaverBlogPublisher:
    def __init__(self):
        self.browser: Browser | None = None
        self.page: Page | None = None

    async def _launch_browser(self):
        """Chrome 프로필을 사용하여 브라우저 실행 (네이버 로그인 세션 유지)"""
        pw = await async_playwright().start()
        self.browser = await pw.chromium.launch_persistent_context(
            user_data_dir=f"{CHROME_USER_DATA_DIR}/{CHROME_PROFILE}",
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
            ],
        )
        self.page = await self.browser.new_page()

    async def _navigate_to_editor(self):
        """네이버 블로그 글쓰기 페이지로 이동"""
        if not self.page:
            raise RuntimeError("브라우저가 실행되지 않았습니다.")

        await self.page.goto("https://blog.naver.com/GoBlogWrite.naver")
        # SmartEditor ONE iframe 로드 대기
        await self.page.wait_for_timeout(3000)

    async def _type_title(self, title: str):
        """제목 입력"""
        if not self.page:
            return
        # SmartEditor ONE 제목 영역
        title_selector = ".se-title-text .se-text-paragraph"
        await self.page.wait_for_selector(title_selector, timeout=10000)
        await self.page.click(title_selector)
        await self.page.keyboard.type(title, delay=30)

    async def _type_content(self, content: str):
        """본문 입력 (마크다운을 일반 텍스트로 변환하여 입력)"""
        if not self.page:
            return

        # 본문 영역 클릭
        body_selector = ".se-component-content .se-text-paragraph"
        await self.page.wait_for_selector(body_selector, timeout=10000)
        await self.page.click(body_selector)

        # 마크다운을 일반 텍스트로 변환
        plain_text = self._markdown_to_plain(content)

        # 줄 단위로 입력 (자연스러운 타이핑)
        lines = plain_text.split("\n")
        for i, line in enumerate(lines):
            if line.strip():
                await self.page.keyboard.type(line, delay=10)
            if i < len(lines) - 1:
                await self.page.keyboard.press("Enter")
                await self.page.wait_for_timeout(50)

    def _markdown_to_plain(self, md: str) -> str:
        """마크다운을 네이버 블로그용 일반 텍스트로 변환"""
        text = md
        # > 인용구 → 그대로 (네이버에서 인용구로 처리)
        # ## 헤딩 → 제거
        text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
        # **볼드** → 그대로 텍스트만
        text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
        # *이탤릭* → 그대로 텍스트만
        text = re.sub(r"\*(.*?)\*", r"\1", text)
        return text

    async def _publish(self):
        """발행 버튼 클릭"""
        if not self.page:
            return

        publish_btn = ".publish_btn__Y5Tls"
        fallback_btn = "button:has-text('발행')"

        try:
            await self.page.click(publish_btn, timeout=5000)
        except Exception:
            await self.page.click(fallback_btn, timeout=5000)

        await self.page.wait_for_timeout(2000)

        # 발행 확인 버튼
        confirm_btn = ".confirm_btn__WEaBq"
        fallback_confirm = "button:has-text('확인')"
        try:
            await self.page.click(confirm_btn, timeout=5000)
        except Exception:
            try:
                await self.page.click(fallback_confirm, timeout=3000)
            except Exception:
                pass

        await self.page.wait_for_timeout(3000)

    async def publish(self, title: str, content: str) -> dict:
        """전체 발행 프로세스 실행"""
        try:
            await self._launch_browser()
            await self._navigate_to_editor()
            await self._type_title(title)
            await self._type_content(content)
            await self._publish()

            current_url = self.page.url if self.page else ""
            return {"url": current_url, "success": True}
        except Exception as e:
            raise RuntimeError(f"네이버 블로그 발행 실패: {str(e)}")
        finally:
            if self.browser:
                await self.browser.close()
