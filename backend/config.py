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

# 브랜드 프로필 파일 (브랜드 블로그 글쓰기 모드용)
BRAND_PROFILES_FILE = Path(__file__).parent / "brand_profiles.json"

# 사용자 등록 제품 파일 (후기성 블로그 글쓰기 모드용)
PRODUCTS_FILE = Path(__file__).parent / "products.json"

# 서버 설정
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
