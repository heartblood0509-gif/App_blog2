"""fal.ai 이미지 생성 클라이언트 (nano-banana).

사용자 fal 키가 있으면 gemini_client 대신 이 모듈로 이미지를 생성한다.
Gemini 이미지 API의 분당 한도(429)를 fal 큐로 오프로드하려는 목적이며,
nano-banana는 Gemini 이미지 모델을 fal 큐로 호출하는 것이라 결과물은 동일하다.
(블로그 frontend/src/lib/ai/fal-provider.ts 의 파이썬 이식판)

블로그(JS)는 @fal-ai/client 의 subscribe + sync_mode:true 로 이미지를 인라인 수신하지만,
여기선 의존성 없이 fal_video.py 와 동일한 큐 REST 패턴(submit→poll→download)을 쓴다.
"""

import asyncio
import base64
import io
import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

FAL_QUEUE_URL = "https://queue.fal.run"


def _headers(api_key: str = None) -> dict:
    key = api_key
    if not key:
        raise RuntimeError(
            "fal.ai API 키가 설정되지 않았습니다. 설정 화면에서 사용자 본인의 FAL API 키를 저장해주세요."
        )
    return {
        "Authorization": f"Key {key}",
        "Content-Type": "application/json",
    }


def _is_pro_model(style: str = None) -> bool:
    # 현재 유튜브엔 pro 선택 UI가 없어 항상 기본(nano-banana-2)을 쓴다.
    # 추후 pro 옵션이 생기면 여기서 분기.
    return False


def _pil_to_data_uri(pil_image) -> str:
    """PIL.Image → data:image/png;base64,... 변환 (fal image_urls 입력용)."""
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _build_request(prompt: str, aspect_ratio: str, reference_images: list):
    """(model_id, body) 구성. 참조 이미지가 있으면 edit 엔드포인트로 간다."""
    pro = _is_pro_model()
    common = {"num_images": 1, "output_format": "png"}

    if reference_images:
        model_id = settings.FAL_IMAGE_EDIT_MODEL_PRO if pro else settings.FAL_IMAGE_EDIT_MODEL
        image_urls = [_pil_to_data_uri(img) for img in reference_images]
        # 참조가 있어도 aspect_ratio 를 명시해 9:16 을 강제한다.
        # (Gemini 직접 경로가 ImageConfig(aspect_ratio="9:16") 를 참조 유무와 무관하게 적용하는 것과 동일.)
        # 미전달 시 edit 는 입력(참조) 이미지 비율을 따라가 9:16 이 깨지고, 그 이미지가 9:16 을
        # 요구하는 영상 모델(veo 등)로 넘어가면 거부(422)된다.
        # thinking_level:"high" 는 프롬프트 순종도 향상 (블로그 transformImage 동일).
        body = {"prompt": prompt, "image_urls": image_urls, "aspect_ratio": aspect_ratio, "thinking_level": "high", **common}
    else:
        model_id = settings.FAL_IMAGE_MODEL_PRO if pro else settings.FAL_IMAGE_MODEL
        body = {"prompt": prompt, "aspect_ratio": aspect_ratio, **common}

    return model_id, body


async def _submit(model_id: str, body: dict, api_key: str) -> dict:
    """fal 큐에 태스크 제출. Returns {request_id, status_url, response_url}."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{FAL_QUEUE_URL}/{model_id}",
            json=body,
            headers=_headers(api_key),
        )
        resp.raise_for_status()
        data = resp.json()
    return {
        "request_id": data["request_id"],
        "status_url": data["status_url"],
        "response_url": data["response_url"],
    }


async def _poll(status_url: str, response_url: str, api_key: str, timeout: int = 240, interval: int = 3) -> str:
    """완료까지 폴링 후 결과 이미지 URL(또는 data URI) 반환."""
    import time

    start = time.time()
    async with httpx.AsyncClient(timeout=30) as client:
        while time.time() - start < timeout:
            resp = await client.get(status_url, headers=_headers(api_key))
            resp.raise_for_status()
            status = resp.json().get("status")

            if status == "COMPLETED":
                result_resp = await client.get(response_url, headers=_headers(api_key))
                result_resp.raise_for_status()
                result = result_resp.json()
                images = result.get("images") or []
                url = images[0].get("url") if images else None
                if not url:
                    raise RuntimeError("fal.ai: 이미지 URL이 없습니다")
                return url

            if status == "FAILED":
                error = resp.json().get("error", "알 수 없는 에러")
                raise RuntimeError(f"fal.ai 이미지 생성 실패: {error}")

            await asyncio.sleep(interval)

    raise RuntimeError(f"fal.ai 타임아웃: {timeout}초 초과")


async def _download(url: str, output_path: str) -> None:
    """결과 이미지를 output_path 에 저장. https URL 과 data: URI 모두 처리."""
    import os

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    if url.startswith("data:"):
        # data:image/png;base64,XXXX
        _, b64 = url.split(",", 1)
        image_bytes = base64.b64decode(b64)
    else:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            image_bytes = resp.content
    with open(output_path, "wb") as f:
        f.write(image_bytes)


def _status_code(err: Exception) -> int | None:
    resp = getattr(err, "response", None)
    return getattr(resp, "status_code", None) if resp is not None else None


async def generate_image(
    prompt: str,
    style: str,
    output_path: str,
    *,
    api_key: str = None,
    reference_images: list = None,
    aspect_ratio: str = "9:16",
    max_retries: int = 3,
    progress_callback=None,
    job_id: str = None,
) -> str:
    """fal.ai(nano-banana)로 이미지 생성. gemini_client.generate_image 와 동일 시그니처(드롭인).

    반환: 저장된 파일 경로(output_path).
    """
    # 스타일 접미사는 Gemini 경로와 동일하게 적용 (지연 import 로 순환 import 회피).
    from core.gemini_client import STYLE_SUFFIXES

    style_suffix = STYLE_SUFFIXES.get(style, "")
    full_prompt = f"{prompt}, {style_suffix}" if style_suffix else prompt
    model_id, body = _build_request(full_prompt, aspect_ratio, reference_images)

    log_body = {k: (v if k != "image_urls" else f"[{len(v)} data-uri]") for k, v in body.items()}
    logger.info("[fal_image] 요청 → %s | body=%s", model_id, log_body)

    for attempt in range(max_retries + 1):
        try:
            task = await _submit(model_id, body, api_key)
            logger.info("[fal_image] 제출 OK request_id=%s", task["request_id"])
            url = await _poll(task["status_url"], task["response_url"], api_key)
            logger.info("[fal_image] 생성 완료 → %s", "data-uri" if url.startswith("data:") else url[:80])
            await _download(url, output_path)
            import os
            size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
            logger.info("[fal_image] 저장 완료 %s (%d bytes)", output_path, size)
            return output_path

        except Exception as e:
            code = _status_code(e)
            err_str = str(e)
            # fal 일시 오류: 5xx / 429(한도) / 422(블로그 retry-classify 가 재시도 가능으로 분류) / 타임아웃·전송오류
            is_transient = (
                (code is not None and (code >= 500 or code in (429, 422)))
                or isinstance(e, (httpx.TimeoutException, httpx.TransportError))
                or "timed out" in err_str.lower()
                or "타임아웃" in err_str
            )
            if is_transient and attempt < max_retries:
                wait = 30 if code == 429 else 5 * (attempt + 1)
                if code == 429:
                    msg = f"1분에 보낼 수 있는 요청 수를 초과했어요. 약 {wait}초 후 자동으로 재시도합니다"
                else:
                    msg = f"AI 서버가 일시적으로 불안정해요. 약 {wait}초 후 자동으로 재시도합니다"
                logger.warning("[fal_image][RETRY] %s (%d/%d): %s", msg, attempt + 1, max_retries, err_str[:120])
                if progress_callback and job_id:
                    progress_callback(
                        job_id=job_id,
                        status="generating_images",
                        progress=0.1,
                        step=msg,
                    )
                await asyncio.sleep(wait)
                continue
            raise

    raise RuntimeError(f"fal 이미지 생성 실패: {prompt[:50]}...")
