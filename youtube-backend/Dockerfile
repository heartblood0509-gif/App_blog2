# AI 쇼츠 자동 제작 - Docker 이미지
#
# 사용법 (로컬):
#   docker build -t ai-shorts .
#   docker run -p 8000:8000 --env-file .env ai-shorts
#
# Railway 배포: railway.toml로 자동 빌드

FROM python:3.11-slim

# 시스템 패키지: FFmpeg + 한국어 폰트 + soundfile 의존성
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto-cjk \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 비root 사용자 생성
RUN useradd -m -s /bin/bash appuser

WORKDIR /app

# Python 의존성 (레이어 캐시 활용)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 앱 코드 + BGM 복사
COPY . .

# Pretendard 폰트를 시스템 폰트 디렉토리에 설치
RUN mkdir -p /usr/share/fonts/pretendard \
    && cp fonts/*.otf /usr/share/fonts/pretendard/ \
    && fc-cache -f

# 디렉토리 생성 + 권한 설정
RUN mkdir -p /app/storage /app/bgm && chown -R appuser:appuser /app

# 비root 사용자로 전환
USER appuser

EXPOSE 8000

# 컨테이너/Railway 배포는 외부에서 접근해야 하므로 0.0.0.0 바인딩.
# (main.py 기본값은 루프백 127.0.0.1 — Electron 임베드 보안용)
ENV HOST=0.0.0.0

CMD ["python", "main.py"]
