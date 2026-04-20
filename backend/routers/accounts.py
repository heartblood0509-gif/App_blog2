import json
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import ACCOUNTS_FILE, CHROME_PROFILES_DIR

router = APIRouter()


def _load_accounts() -> list[dict]:
    if not ACCOUNTS_FILE.exists():
        return []
    try:
        return json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_accounts(accounts: list[dict]):
    ACCOUNTS_FILE.write_text(
        json.dumps(accounts, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def find_account(account_id: str) -> Optional[dict]:
    for acc in _load_accounts():
        if acc["id"] == account_id:
            return acc
    return None


# === API ===


class AccountCreate(BaseModel):
    label: str
    naver_id: str
    naver_pw: str


class AccountResponse(BaseModel):
    id: str
    label: str
    naver_id: str


@router.get("/", response_model=list[AccountResponse])
async def list_accounts():
    """계정 목록 반환 (비밀번호 제외)"""
    accounts = _load_accounts()
    return [
        AccountResponse(id=a["id"], label=a["label"], naver_id=a["naver_id"])
        for a in accounts
    ]


@router.post("/", response_model=AccountResponse)
async def create_account(req: AccountCreate):
    """새 계정 추가"""
    accounts = _load_accounts()

    # ID 자동 생성 (blog1, blog2, ...)
    existing_ids = {a["id"] for a in accounts}
    idx = 1
    while f"blog{idx}" in existing_ids:
        idx += 1
    new_id = f"blog{idx}"

    # 중복 naver_id 체크
    for a in accounts:
        if a["naver_id"] == req.naver_id:
            raise HTTPException(400, f"이미 등록된 네이버 ID입니다: {req.naver_id}")

    new_account = {
        "id": new_id,
        "label": req.label,
        "naver_id": req.naver_id,
        "naver_pw": req.naver_pw,
    }
    accounts.append(new_account)
    _save_accounts(accounts)

    return AccountResponse(id=new_id, label=req.label, naver_id=req.naver_id)


@router.delete("/{account_id}")
async def delete_account(account_id: str):
    """계정 삭제 (Chrome 프로필도 함께 삭제)"""
    accounts = _load_accounts()
    new_accounts = [a for a in accounts if a["id"] != account_id]

    if len(new_accounts) == len(accounts):
        raise HTTPException(404, "해당 계정을 찾을 수 없습니다.")

    _save_accounts(new_accounts)

    # 해당 계정의 Chrome 프로필 삭제
    profile_dir = Path(CHROME_PROFILES_DIR) / account_id
    if profile_dir.exists():
        shutil.rmtree(profile_dir, ignore_errors=True)

    return {"message": f"계정 '{account_id}'이 삭제되었습니다."}
