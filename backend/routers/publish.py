from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from bots.naver_blog_publisher import NaverBlogPublisher
from config import CHROME_PROFILES_DIR
from routers.accounts import find_account
from utils.image_storage import tempdir_context

router = APIRouter()


class ImageSlotData(BaseModel):
    slot_id: str
    description: str
    group_id: Optional[str] = None
    pair_role: Optional[str] = None  # "first" | "second"
    base64: str
    mime_type: Optional[str] = None


class PublishRequest(BaseModel):
    title: str
    content: str
    account_id: str
    images: List[ImageSlotData] = []
    auto_publish: bool = True  # False면 글 작성만 하고 Chrome 열어둠


class PublishResponse(BaseModel):
    success: bool
    message: str
    post_url: Optional[str] = None
    warning: Optional[str] = None
    today_count: Optional[int] = None
    image_failures: Optional[int] = None
    mode: Optional[str] = None  # "published" | "awaiting_manual_publish"


@router.post("/", response_model=PublishResponse)
async def publish_to_naver(req: PublishRequest):
    """네이버 블로그에 글을 자동 발행합니다."""
    account = find_account(req.account_id)
    if not account:
        raise HTTPException(404, f"등록되지 않은 계정입니다: {req.account_id}")

    profile_path = f"{CHROME_PROFILES_DIR}/{account['id']}"

    # 이미지 슬롯을 임시 파일로 저장 (발행 종료 시 자동 정리)
    slot_dicts = [img.model_dump() for img in req.images]

    with tempdir_context(slot_dicts) as (tempdir, path_map):
        # publisher에 넘길 슬롯: base64 제거하고 path 주입
        image_slots = []
        for slot in slot_dicts:
            sid = slot["slot_id"]
            path = path_map.get(sid)
            if not path:
                continue
            image_slots.append({
                "slot_id": sid,
                "description": slot.get("description", ""),
                "group_id": slot.get("group_id"),
                "pair_role": slot.get("pair_role"),
                "path": str(path),
            })

        try:
            publisher = NaverBlogPublisher()
            result = await publisher.publish(
                title=req.title,
                content=req.content,
                naver_id=account["naver_id"],
                naver_pw=account["naver_pw"],
                profile_path=profile_path,
                image_slots=image_slots if image_slots else None,
                auto_publish=req.auto_publish,
            )
            today_count = result.get("today_count")
            mode = result.get("mode")

            if mode == "awaiting_manual_publish":
                message = (
                    f"글 작성 완료. Chrome 창에서 직접 '발행' 버튼을 눌러주세요. "
                    f"({account['label']})"
                )
            else:
                message = f"네이버 블로그에 성공적으로 발행되었습니다. ({account['label']})"
                if today_count:
                    message += f" (오늘 {today_count}번째 발행)"

            return PublishResponse(
                success=True,
                message=message,
                post_url=result.get("url"),
                warning=result.get("warning"),
                today_count=today_count,
                image_failures=result.get("image_failures"),
                mode=mode,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
