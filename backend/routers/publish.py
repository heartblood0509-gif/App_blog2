from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bots.naver_blog_publisher import NaverBlogPublisher

router = APIRouter()


class PublishRequest(BaseModel):
    title: str
    content: str  # 마크다운 형식의 본문


class PublishResponse(BaseModel):
    success: bool
    message: str
    post_url: Optional[str] = None


@router.post("/", response_model=PublishResponse)
async def publish_to_naver(req: PublishRequest):
    """네이버 블로그에 글을 자동 발행합니다."""
    try:
        publisher = NaverBlogPublisher()
        result = await publisher.publish(title=req.title, content=req.content)
        return PublishResponse(
            success=True,
            message="네이버 블로그에 성공적으로 발행되었습니다.",
            post_url=result.get("url"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
