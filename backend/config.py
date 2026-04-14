import os
from dotenv import load_dotenv

load_dotenv()

# 네이버 블로그 설정
NAVER_BLOG_URL = "https://blog.naver.com"
CHROME_USER_DATA_DIR = os.getenv(
    "CHROME_USER_DATA_DIR",
    os.path.expanduser("~/Library/Application Support/Google/Chrome"),
)
CHROME_PROFILE = os.getenv("CHROME_PROFILE", "Default")

# 서버 설정
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
