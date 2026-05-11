"""
서사 구조 분석 보관함 — 사용자 분석 + 내장 템플릿 통합 CRUD.

저장소: backend/analysis_records.json

핵심 원칙:
- 원본 견본 글 본문은 저장하지 않는다 (LLM 표절 차단의 핵심 정책).
- 분석 마크다운 + 단계 라벨(flow) + 어미 패턴 통계 요약(excerptPattern)만 보관.

레코드 종류:
- sourceType="user": 사용자가 직접 레퍼런스 모드에서 분석 후 저장
- sourceType="builtin": 시스템 내장 템플릿 (예: 함정 폭로형) — isBuiltin=True, 사용자 수정·삭제 불가

ID 자동 생성:
- 사용자: "analysis-1", "analysis-2", ...
- 내장: "builtin-<slug>" (시드 함수에서 명시)
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import ANALYSIS_RECORDS_FILE

router = APIRouter()


# ─────────────────────────────────────────────
# 저장소 입출력
# ─────────────────────────────────────────────

def _load_records() -> list[dict]:
    if not ANALYSIS_RECORDS_FILE.exists():
        return []
    try:
        return json.loads(ANALYSIS_RECORDS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save_records(records: list[dict]):
    ANALYSIS_RECORDS_FILE.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find(record_id: str) -> Optional[dict]:
    for r in _load_records():
        if r.get("id") == record_id:
            return r
    return None


# ─────────────────────────────────────────────
# 요청/응답 스키마
# ─────────────────────────────────────────────

class AnalysisRecordUpsert(BaseModel):
    label: str = Field(..., min_length=1)
    sourceType: str = Field(..., pattern="^(user|builtin)$")
    sourceUrl: Optional[str] = None
    analysis: str = Field(..., min_length=1)
    flow: list[str] = []
    excerptPattern: str = ""


# ─────────────────────────────────────────────
# API
# ─────────────────────────────────────────────

@router.get("/")
async def list_records() -> list[dict]:
    """전체 분석 레코드 — builtin 먼저, 그 다음 사용자 분석 (createdAt 내림차순)."""
    records = _load_records()
    builtins = [r for r in records if r.get("isBuiltin")]
    users = sorted(
        [r for r in records if not r.get("isBuiltin")],
        key=lambda r: r.get("createdAt", ""),
        reverse=True,
    )
    return [*builtins, *users]


@router.get("/{record_id}")
async def get_record(record_id: str) -> dict:
    r = _find(record_id)
    if not r:
        raise HTTPException(404, "해당 분석 레코드를 찾을 수 없습니다.")
    return r


@router.post("/")
async def create_record(req: AnalysisRecordUpsert) -> dict:
    if req.sourceType == "builtin":
        raise HTTPException(400, "builtin 레코드는 사용자가 생성할 수 없습니다.")

    records = _load_records()

    existing_ids = {r.get("id") for r in records}
    idx = 1
    while f"analysis-{idx}" in existing_ids:
        idx += 1
    new_id = f"analysis-{idx}"

    new_record = {
        "id": new_id,
        "isBuiltin": False,
        "createdAt": _now_iso(),
        **req.model_dump(),
    }
    records.append(new_record)
    _save_records(records)
    return new_record


@router.put("/{record_id}")
async def update_record(record_id: str, req: AnalysisRecordUpsert) -> dict:
    records = _load_records()
    for i, r in enumerate(records):
        if r.get("id") == record_id:
            if r.get("isBuiltin"):
                raise HTTPException(400, "내장 분석 레코드는 수정할 수 없습니다.")
            updated = {
                "id": record_id,
                "isBuiltin": False,
                "createdAt": r.get("createdAt", _now_iso()),
                **req.model_dump(),
            }
            records[i] = updated
            _save_records(records)
            return updated
    raise HTTPException(404, "해당 분석 레코드를 찾을 수 없습니다.")


@router.delete("/{record_id}")
async def delete_record(record_id: str) -> dict:
    records = _load_records()
    target = next((r for r in records if r.get("id") == record_id), None)
    if not target:
        raise HTTPException(404, "해당 분석 레코드를 찾을 수 없습니다.")
    if target.get("isBuiltin"):
        raise HTTPException(400, "내장 분석 레코드는 삭제할 수 없습니다.")
    new_records = [r for r in records if r.get("id") != record_id]
    _save_records(new_records)
    return {"message": f"분석 레코드 '{record_id}'이 삭제되었습니다."}


# ─────────────────────────────────────────────
# Builtin 시드 — 첫 기동 시 1회 주입
# ─────────────────────────────────────────────

BUILTIN_SEEDS: list[dict] = [
    {
        "id": "builtin-info-5-trap",
        "label": "함정 폭로형 (내장)",
        "sourceType": "builtin",
        "sourceUrl": None,
        "analysis": """## 서사 구조 (6단계)

### 1단계 — 후킹: 피해 사례 인용
- 실제 피해자/소비자의 부정 감정 발언을 짧은 따옴표 인용으로 2~3개 연속 배치
- 패턴: [의심 질문형 인용] + [확신성 한탄형 인용]
- 짧고 강한 감정 단어로 시작해 불안·공감을 즉시 형성
- 인용은 새 글의 도메인에 맞춰 처음부터 창작 (견본 인용을 그대로 쓰지 않음)

### 2단계 — 타겟 필터링·경고
- "이미 X를 끝낸 사람은 100% 후회한다" 류의 강한 경고문
- 특정 조건(예산·상황) 충족하는 독자만 남기는 필터링 — 글의 가치 상승 효과
- "절대 이 글을 읽지 마라" 식 역설 활용해 오히려 읽고 싶게 만듦
- 본문 도메인의 비용·예산·상황 어휘로 새로 작성

### 3단계 — 자기 고백 + 사명감
- 화자(작가)가 과거 비슷한 좌절을 겪은 일화로 진정성 확보
- 비양심 업체·시장 관행 때문에 분노했던 경험 공유
- "피해자에게 알려야겠다"는 글 작성 동기 명시
- 일화의 산업·지역·금액은 본문 도메인의 것으로

### 4단계 — 주의사항 N가지 (본론)
- "목숨걸고 조심해야 할 N가지" 류 강력한 메인 소제목 (인용구 박스 — postit 스타일)
- 첫째/둘째/셋째 식 인라인 번호로 N가지 풀어냄
- 각 항목마다 구체 수치·일화·비유 활용
- 큰 항목 안에 추가 인용구 소제목으로 세분화 가능
- 단정형 어미 + 시각적 강조(절.대.로 같은 단어 사이 마침표)

### 5단계 — 객관 입장 (상업성 유보)
- "꼭 저희한테 맡기란 말 아닙니다" 류 겸손 한 마디
- "폭로가 된 글" 같은 자기 성찰 표현
- 우리 업체가 누구인지는 마지막까지 일부러 밝히지 않음

### 6단계 — 부드러운 CTA (마무리)
- "도움이 되셨다면 필요하신 분들만 문의해주세요" 류 부드러운 초대
- 브랜드명은 글 마지막 1~2문장에서만 노출 (전체의 95% 지점)
- 광고 직접 표현 금지 — "감사" 톤으로 닫음

## 소제목 분석
- 메인 스타일: postit (포스트잇) — 정보·폭로 톤에 적합
- 갯수: 4개 내외 (주의사항 N가지 + 마무리)
- 마지막 마무리만 underline 스타일로 변주 가능

## 톤 요약
- 95% 구어체, 단정형 합니다체 (~합니다, ~할 껍니다, ~겠죠?)
- 짧은 문장 위주, 거의 모든 문장이 한 문단을 형성할 정도로 잦은 줄바꿈
- 감정 단어 직설 사용 (사기·바가지·비양심·분노·뼈 시리도록 — 단, 본문 도메인에 맞게 어휘 교체)
- 시각 강조: 단어 사이 마침표 (절.대.로, 비.양.심.)

## SEO 기본
- 메인 키워드 첫 문단 1회 등장 필수
- 전체 5~7회 자연스럽게 반복
- 보조 키워드 본문에 자연 삽입""",
        "flow": ["피해 사례", "경고", "고백", "주의사항", "객관 입장", "마무리"],
        "excerptPattern": "단정형 ~합니다체 위주, 단어 사이 마침표 강조 (절.대.로), 짧은 단언+긴 풀이 혼합",
        "createdAt": "2026-05-07T00:00:00+00:00",
        "isBuiltin": True,
    },
]


def ensure_builtin_seeds():
    """첫 기동 시 builtin 시드를 주입. 같은 ID가 이미 있으면 덮어쓰지 않음 (idempotent)."""
    records = _load_records()
    existing_ids = {r.get("id") for r in records}
    added = False
    for seed in BUILTIN_SEEDS:
        if seed["id"] not in existing_ids:
            records.append(seed)
            added = True
    if added:
        _save_records(records)
