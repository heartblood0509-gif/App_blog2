import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# 네이버 블로그 설정
NAVER_BLOG_URL = "https://blog.naver.com"

# 계정별 Chrome 프로필 디렉토리 (계정마다 별도 세션)
CHROME_PROFILES_DIR = os.getenv(
    "CHROME_PROFILES_DIR",
    os.path.expanduser("~/Library/Application Support/app-blog2/chrome-profiles"),
)

# 계정 정보 파일
ACCOUNTS_FILE = Path(__file__).parent / "accounts.json"

# 서버 설정
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
