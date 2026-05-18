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
    # 분석이 속한 템플릿 범위 — 보관함 필터링 키 (intro/info/value-proof/detail). 미지정 시 "info" fallback (하위호환)
    templateScope: Optional[str] = Field(default=None, pattern="^(intro|info|value-proof|detail)$")
    # 제목 만드는 법 — 카드별 톤 견본. dict로 받아 프론트·LLM에 검증 위임 (구조: structureLabel/emotions/formula/patterns)
    titleFormula: Optional[dict] = None


# ─────────────────────────────────────────────
# API
# ─────────────────────────────────────────────

@router.get("/")
async def list_records(scope: Optional[str] = None) -> list[dict]:
    """전체 분석 레코드 — builtin 먼저, 그 다음 사용자 분석 (createdAt 내림차순).

    scope: "intro" | "info" | "value-proof" | "detail" 지정 시 해당 템플릿만 필터링.
           미지정 시 전체 반환 (하위호환).
           record에 templateScope 누락 시 "info"로 간주 (마이그레이션 fallback).
    """
    records = _load_records()
    if scope:
        if scope not in ("intro", "info", "value-proof", "detail"):
            raise HTTPException(400, f"잘못된 scope: {scope}")
        records = [r for r in records if (r.get("templateScope") or "info") == scope]
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
#
# 시드 데이터는 backend/analysis_records.json (코드 동봉본)을 단일 진실로 사용.
# 새 시드를 추가하려면 JSON 파일에 isBuiltin=True 객체를 한 건 추가하면 됨 —
# 코드와 데이터 이중 관리 방지.

from pathlib import Path as _Path


def _load_builtin_seeds_from_json() -> list[dict]:
    """backend/analysis_records.json의 isBuiltin=True 레코드를 시드로 사용."""
    seed_file = _Path(__file__).parent.parent / "analysis_records.json"
    if not seed_file.exists():
        return []
    try:
        data = json.loads(seed_file.read_text(encoding="utf-8"))
        return [r for r in data if r.get("isBuiltin")]
    except Exception:
        return []


BUILTIN_SEEDS: list[dict] = _load_builtin_seeds_from_json()


# builtin 카드들에 titleFormula 자동 보강용 사전. ID로 매칭하여 누락 시 주입.
BUILTIN_TITLE_FORMULAS: dict[str, dict] = {
    "builtin-info-whistleblower": {
        "structureLabel": "업계 내부고발형",
        "emotions": ["결연", "분노", "충격"],
        "formula": "메인 키워드 → 폭로 대가 감수 → 업계 민낯·진실 폭로",
        "patterns": [
            {"label": "각오 폭로",   "tail": "매장당할 각오로 진실을 전부 공개합니다"},
            {"label": "봉인 해제",   "tail": "죽을 때까지 숨기려 했던 업계 금기, 다 터뜨립니다"},
            {"label": "연민 폭로",   "tail": "속는 줄도 모르고 감사해하는 당신이 안쓰러워 쓰는 글"},
            {"label": "민낯 공개",   "tail": "고소 각오하고 까발리는 업계의 역겨운 민낯"},
            {"label": "역설 풍자",   "tail": "호구 되는 법? 간단합니다. 업체 시키는 대로 하세요"},
            {"label": "삭제 위협",   "tail": "이 글은 곧 삭제될 수 있습니다. 동종 업계에서 압박 들어오고 있네요"},
            {"label": "내부자 증언", "tail": "실제 내부 고발자가 폭로한 '고객 등쳐먹기' 시나리오"},
        ],
    },
    "builtin-info-base-criteria": {
        "structureLabel": "정보성 기본형",
        "emotions": ["궁금증", "기준", "신뢰"],
        "formula": "메인 키워드 → 무엇을 → 어떤 기준으로 봐야 하는가",
        "patterns": [
            {"label": "입문 안내",   "tail": "처음이라면 꼭 알아야 할 부분"},
            {"label": "헷갈림 정리", "tail": "가장 많이 헷갈리는 내용 정리"},
            {"label": "확인 기준",   "tail": "꼭 확인해야 할 기준"},
            {"label": "핵심 안내",   "tail": "실제로 중요한 건 따로 있습니다"},
            {"label": "기준 질문",   "tail": "어떤 기준으로 봐야 할까"},
            {"label": "놓침 경고",   "tail": "많은 분들이 놓치는 부분"},
            {"label": "중요 기준",   "tail": "생각보다 중요했던 기준"},
        ],
    },
    "builtin-info-expert-trust": {
        "structureLabel": "전문가 신뢰 설득형",
        "emotions": ["안심", "신뢰", "안정감"],
        "formula": "메인 키워드 → 경험 또는 기준 → 전문적 관점 제시",
        "patterns": [
            {"label": "경험 기준",   "tail": "실제 경험으로 느낀 가장 중요한 기준"},
            {"label": "현장 사례",   "tail": "현장에서 가장 많이 보는 사례"},
            {"label": "핵심 강조",   "tail": "결국 중요한 건 이 부분입니다"},
            {"label": "경력 통찰",   "tail": "오래 경험하면서 느낀 점"},
            {"label": "결과 차이",   "tail": "생각보다 결과 차이가 큰 부분"},
            {"label": "공통점",      "tail": "많은 사례를 보며 느낀 공통점"},
            {"label": "우선순위",    "tail": "처음보다 더 중요하게 생각하게 된 것"},
        ],
    },
    "builtin-info-conscience-trust": {
        "structureLabel": "양심 업체 신뢰형",
        "emotions": ["공감", "진정성", "인간미"],
        "formula": "메인 키워드 → 소통 또는 진심 → 운영 철학 연결",
        "patterns": [
            {"label": "직접 설명",   "tail": "끝까지 직접 설명드리는 이유"},
            {"label": "가치 우선",   "tail": "가장 중요하게 생각하는 부분"},
            {"label": "운영 방침",   "tail": "이런 방식으로 진행하는 이유"},
            {"label": "약속 기준",   "tail": "저희가 꼭 지키려고 하는 기준"},
            {"label": "동반 진행",   "tail": "하나부터 열까지 함께하는 이유"},
            {"label": "고객 관점",   "tail": "고객 입장에서 계속 고민했던 부분"},
            {"label": "신뢰 결론",   "tail": "결국 신뢰가 가장 중요했습니다"},
        ],
    },
    # 소개글 — 신념 선언형 (대표 신념 기반 소개형 카드)
    # 정보성글과 정반대 정책: 회사명·대표 노출 OK. title.ts에서 ZERO_EXPOSURE 룰 부착 안 함.
    "builtin-intro-belief-based": {
        "structureLabel": "신념 선언형",
        "emotions": ["신뢰", "책임감", "진정성"],
        "formula": "메인 키워드 → 대표 등장 → 약속 또는 신념 선언",
        "patterns": [
            {"label": "이름 약속",   "tail": "대표 이름 걸고 약속드립니다"},
            {"label": "지킬 약속",   "tail": "이것만은 꼭 지키겠습니다"},
            {"label": "핵심 가치",   "tail": "가장 중요하게 생각하는 부분"},
            {"label": "끝까지 책임", "tail": "끝까지 책임지고 싶었습니다"},
            {"label": "기준 고수",   "tail": "저희가 이 기준만은 포기하지 않는 이유"},
            {"label": "신뢰 결론",   "tail": "결국 가장 중요한 건 신뢰였습니다"},
            {"label": "핵심 강조",   "tail": "저는 이 부분을 가장 중요하게 생각합니다"},
        ],
    },
    # 상세페이지글 — 신뢰기간형 카드 (4개 톤 통합)
    # 사용자가 준 6개 톤을 4개로 압축:
    #   문제·기준(문제해결+비교기준) / 공감·경고(공감설득+현실폭로) / 신뢰(단독) / 결과 기대(단독)
    # 회사명·대표 노출 OK (소개글·가치입증글과 동일 정책). title.ts에서 ZERO_EXPOSURE 부착 안 함.
    # 상세페이지는 CTR이 아닌 "전환(구매 욕구 + 신뢰)" 중심.
    "builtin-dt-trust-period": {
        "structureLabel": "신뢰기간형",
        "emotions": ["공감", "신뢰", "경계", "기대"],
        "formula": "메인 키워드 → 현실 고민·기준 → 신뢰 또는 결과 약속",
        "patterns": [
            # 톤 1: 문제·기준 톤 (문제 해결 + 비교 기준)
            {"label": "고질 문제",   "tail": "아무리 해도 달라지지 않았던 이유"},
            {"label": "보편 막힘",   "tail": "많은 분들이 여기서 막힙니다"},
            {"label": "현실 고민",   "tail": "실제로 가장 많이 고민하는 부분"},
            {"label": "핵심 따로",   "tail": "결국 중요한 건 따로 있었습니다"},
            {"label": "기준 질문",   "tail": "어떤 기준으로 비교해야 할까"},
            {"label": "가격 너머",   "tail": "가격보다 중요한 부분"},
            {"label": "체크 포인트", "tail": "꼭 확인해야 할 부분"},
            # 톤 2: 공감·경고 톤 (공감 설득 + 현실 폭로)
            {"label": "같은 고민",   "tail": "저라도 같은 고민을 했을 겁니다"},
            {"label": "처음 불안",   "tail": "처음이라 더 불안하셨을 겁니다"},
            {"label": "비교 행동",   "tail": "계속 비교만 하게 되는 이유"},
            {"label": "보편 공감",   "tail": "이런 고민 정말 많이 하십니다"},
            {"label": "눈탱이 경고", "tail": "대부분 여기서 눈탱이 맞습니다"},
            {"label": "업계 침묵",   "tail": "업계 사람들이 먼저 말 안 하는 이유"},
            {"label": "손실 경고",   "tail": "끝까지 안 보면 손해볼 수 있습니다"},
            {"label": "마지막 진실", "tail": "진짜 중요한 건 마지막에 보입니다"},
            # 톤 3: 신뢰 톤 (신뢰 구축 단독)
            {"label": "끝까지 설명", "tail": "저희가 끝까지 설명드리는 이유"},
            {"label": "가치 우선",   "tail": "가장 중요하게 생각하는 건 따로 있습니다"},
            {"label": "신뢰 결론",   "tail": "결국 중요한 건 신뢰였습니다"},
            {"label": "직접 도움",   "tail": "하나부터 열까지 직접 도와드리는 이유"},
            {"label": "소통 우선",   "tail": "저희가 소통을 가장 중요하게 생각하는 이유"},
            {"label": "끝까지 책임", "tail": "끝까지 책임지려고 하는 이유"},
            {"label": "핵심 강조",   "tail": "저희는 이 부분을 가장 중요하게 생각합니다"},
            # 톤 4: 결과 기대 톤 (결과 기대 단독)
            {"label": "변화 가능",   "tail": "이렇게 달라질 수 있습니다"},
            {"label": "만족도",      "tail": "실제로 만족도가 가장 높았던 이유"},
            {"label": "변화 부분",   "tail": "진행 후 가장 많이 달라지는 부분"},
            {"label": "결과 차이",   "tail": "생각보다 결과 차이가 큽니다"},
            {"label": "체감 변화",   "tail": "실제로 가장 체감이 컸던 변화"},
            {"label": "기대 이상",   "tail": "기대 이상이었다는 이야기를 많이 듣습니다"},
            {"label": "이유 있음",   "tail": "결과가 달라지는 데는 이유가 있습니다"},
        ],
    },
    # 가치입증글 — 가치 입증 사례형 카드 (3개 톤 통합)
    # 사용자가 준 5개 톤을 3개로 압축: 결과 강조(극적변화+결과입증) / 드문 사례(희소+전문가실력) / 희망(가능성제시)
    # 회사명·대표 노출 OK (소개글과 동일 정책). title.ts에서 ZERO_EXPOSURE 부착 안 함.
    "builtin-vp-case-proof": {
        "structureLabel": "가치 입증 사례형",
        "emotions": ["놀라움", "확신", "희귀성", "감탄", "희망", "안심"],
        "formula": "메인 키워드 → 사례 상황 또는 어려움 → 결과·드문 사례·가능성 중 하나",
        "patterns": [
            # 톤 1: 결과 강조형 (극적 변화 + 결과 입증)
            {"label": "불가능 반전",   "tail": "거의 불가능했던 상황이 달라진 이유"},
            {"label": "결과 차이",     "tail": "생각보다 결과 차이가 컸던 사례"},
            {"label": "포기 직전 반전", "tail": "포기 직전이었지만 달라졌던 사례"},
            {"label": "실제 결과",     "tail": "실제 결과가 이렇게 달라졌습니다"},
            {"label": "수치 확인",     "tail": "수치로도 차이가 확인됐습니다"},
            {"label": "직접 비교",     "tail": "직접 비교해보면 차이가 보입니다"},
            {"label": "결과 증명",     "tail": "결과로 증명된 사례"},
            # 톤 2: 드문 사례형 (희소 사례 + 전문가 실력)
            {"label": "희소 공개",     "tail": "흔하지 않은 실제 사례 공개"},
            {"label": "현장 드문",     "tail": "현장에서도 드물었던 사례"},
            {"label": "기억 남는",     "tail": "유독 기억에 남았던 사례"},
            {"label": "가장 어려운",   "tail": "가장 어려웠던 사례 중 하나였습니다"},
            {"label": "경험 속 드문", "tail": "오랜 경험 속에서도 드물었던 경우"},
            {"label": "많은 사례 중", "tail": "많은 사례 중 특히 기억에 남았습니다"},
            {"label": "가능 이유",     "tail": "이런 결과가 가능했던 이유"},
            # 톤 3: 희망 메시지형 (가능성 제시 그대로)
            {"label": "어렵지만 가능", "tail": "어렵다고 생각했지만 가능했습니다"},
            {"label": "충분히 가능",   "tail": "충분히 좋아질 수 있습니다"},
            {"label": "포기 X",        "tail": "포기하지 않아도 되는 이유"},
            {"label": "가능성 잔존",   "tail": "생각보다 가능성은 남아있습니다"},
            {"label": "이 상황도",     "tail": "이런 상황에서도 충분히 가능합니다"},
            {"label": "고민 멈춤",     "tail": "고민만 하고 계셨다면 꼭 보세요"},
        ],
    },
    # 상세페이지글 — 전액환불 보증형 카드 (5개 톤 통합)
    # 톤 구성: 리스크 제거 / 자신감 선언 / 손실 회피 / 고객 안심 / 충격 보장
    # 회사명·대표 노출 OK (신뢰기간형과 동일 정책). title.ts에서 ZERO_EXPOSURE 부착 안 함.
    # 핵심 심리: "이 정도면 한번 믿어봐도 되겠다" — 리스크 제거로 구매 결정 가속.
    "builtin-dt-refund-guarantee": {
        "structureLabel": "전액환불 보증형",
        "emotions": ["안심", "확신", "후회방지", "인간미", "놀라움"],
        "formula": "메인 키워드 → 불안·자신감·손실회피·공감·충격 중 하나 → 보장 선언",
        "patterns": [
            # 톤 1: 리스크 제거형 (불안 제거 + 안심)
            {"label": "만족 환불",     "tail": "결과가 만족스럽지 않다면 전액 환불해드리겠습니다"},
            {"label": "끝까지 책임",   "tail": "끝까지 책임지겠습니다"},
            {"label": "불안 차단",     "tail": "불안하실 필요 없습니다"},
            {"label": "증명 환불",     "tail": "결과로 증명하지 못하면 전액 환불하겠습니다"},
            {"label": "자신 약속",     "tail": "자신 있기 때문에 가능한 약속입니다"},
            {"label": "전부 반환",     "tail": "만족하지 못하신다면 전부 돌려드리겠습니다"},
            {"label": "리스크 부담",   "tail": "리스크는 저희가 안고 가겠습니다"},
            {"label": "책임 이유",     "tail": "끝까지 책임지는 이유가 있습니다"},
            # 톤 2: 자신감 선언형 (확신 + 신뢰)
            {"label": "자신 진행",     "tail": "자신 있기 때문에 이렇게 진행합니다"},
            {"label": "자신 전제",     "tail": "결과에 자신 없었다면 못 했을 겁니다"},
            {"label": "보장 이유",     "tail": "이 정도까지 보장하는 이유"},
            {"label": "책임 자신",     "tail": "끝까지 책임질 자신 있습니다"},
            {"label": "결과 증명",     "tail": "실제 결과로 증명하겠습니다"},
            {"label": "확신 가능",     "tail": "결과에 확신이 있기 때문에 가능합니다"},
            {"label": "맡김 이유",     "tail": "믿고 맡기셔도 되는 이유"},
            {"label": "괜한 약속 X",   "tail": "괜히 이런 약속을 하는 게 아닙니다"},
            # 톤 3: 손실 회피 + 전환형 (후회 방지)
            {"label": "실패 불안",     "tail": "실패가 불안하셨다면 끝까지 보셔야 합니다"},
            {"label": "후회 차단",     "tail": "후회할 가능성까지 줄였습니다"},
            {"label": "결과 걱정",     "tail": "결과가 걱정되셨다면 이렇게까지는 안 했을 겁니다"},
            {"label": "보편 불안",     "tail": "대부분 여기서 불안해하십니다"},
            {"label": "돈 손실",       "tail": "돈만 날릴까 걱정되셨다면"},
            {"label": "부담 제거",     "tail": "실패 부담 없이 시작하셔도 됩니다"},
            {"label": "결과 답",       "tail": "결과가 안 나오면 어떡하냐는 질문에 대한 답"},
            {"label": "처음 불안",     "tail": "처음이라 더 불안하셨을 겁니다"},
            # 톤 4: 고객 안심형 (공감 + 인간미)
            {"label": "혼자 X",        "tail": "혼자 불안해하지 않으셔도 됩니다"},
            {"label": "함께 도움",     "tail": "끝까지 함께 도와드리겠습니다"},
            {"label": "처음 걱정",     "tail": "처음이라 더 걱정되셨을 겁니다"},
            {"label": "부담 X 시작",   "tail": "부담 없이 시작하실 수 있도록 준비했습니다"},
            {"label": "편한 결정",     "tail": "편하게 결정하실 수 있도록 만들었습니다"},
            {"label": "선제 책임",     "tail": "저희가 먼저 책임지겠습니다"},
            {"label": "신뢰 우선",     "tail": "결과보다 더 중요한 건 신뢰였습니다"},
            {"label": "안심 시작",     "tail": "안심하고 시작하실 수 있도록 준비했습니다"},
            # 톤 5: 충격 보장형 (의외성 + 신뢰)
            {"label": "보장 이유",     "tail": "여기까지 보장하는 이유가 있습니다"},
            {"label": "환불 이유",     "tail": "전액환불까지 걸 수 있었던 이유"},
            {"label": "드문 진행",     "tail": "실제로 이렇게까지 진행하는 곳은 드뭅니다"},
            {"label": "보편 불가",     "tail": "보통은 절대 이렇게 못 합니다"},
            {"label": "흔치 않음",     "tail": "이 정도 자신감은 흔치 않습니다"},
            {"label": "책임 의미",     "tail": "끝까지 책임지겠다는 의미입니다"},
            {"label": "괜한 약속 X 2", "tail": "괜히 이런 약속을 드리는 게 아닙니다"},
            {"label": "책임 회피",     "tail": "대부분은 여기서 책임을 피합니다"},
        ],
    },
    # 상세페이지글 — 이벤트 유도형 카드 (5개 톤 통합)
    # 사용자가 준 10개 톤을 5개로 압축:
    #   한정·마감(한정혜택+선착순+마감임박) / 혜택 강조(무료+혜택폭발) / 손실회피·비용(손해방지+비용고민)
    #   / 부담제거·상담(상담유도+즉시행동) / 호기심 유발(궁금증)
    # 회사명·대표 노출 OK (신뢰기간형·전액환불 보증형과 동일 정책).
    # 핵심 심리: "지금 안 보면 손해일 수도 있겠다" — 신뢰 위에 한정 혜택으로 행동 가속.
    # ⚠️ '역대급·대박·미친 혜택' 같은 허세 광고 톤 금지. 구체성과 신뢰가 핵심.
    "builtin-dt-event-induce": {
        "structureLabel": "이벤트 유도형",
        "emotions": ["기회", "긴급성", "이득", "손실회피", "부담제거", "호기심"],
        "formula": "메인 키워드 → 한정·혜택·손실회피·부담제거·호기심 중 하나 → 행동 유도",
        "patterns": [
            # 톤 1: 한정·마감 강조형 (한정혜택 + 선착순 + 마감임박 통합)
            {"label": "다시 없음",     "tail": "이번 이벤트는 다시 열리지 않을 수 있습니다"},
            {"label": "한정 기간",     "tail": "한정 기간 동안만 진행됩니다"},
            {"label": "오래 X",        "tail": "이번 이벤트는 오래 진행하지 않습니다"},
            {"label": "마감 전",       "tail": "마감 전 꼭 확인해보셔야 합니다"},
            {"label": "이번 달까지",   "tail": "이번 달까지만 진행됩니다"},
            {"label": "조건 어려움",   "tail": "이번 달 지나면 같은 조건은 어려울 수 있습니다"},
            {"label": "선착순 우선",   "tail": "선착순으로 우선 제공됩니다"},
            {"label": "종료 전 확인",  "tail": "종료 전에 확인해보셔야 합니다"},
            # 톤 2: 혜택 강조형 (무료혜택 + 혜택폭발 통합)
            {"label": "무료 지원",     "tail": "지금 신청하시면 무료로 지원해드립니다"},
            {"label": "추가비용 X",    "tail": "추가 비용 없이 받아보실 수 있습니다"},
            {"label": "상담 혜택",     "tail": "상담만 받아도 혜택이 제공됩니다"},
            {"label": "처음 혜택",     "tail": "이 혜택까지 드리는 건 이번이 처음입니다"},
            {"label": "넘기 아까움",   "tail": "솔직히 그냥 넘기기 아깝습니다"},
            {"label": "좋은 조건",     "tail": "지금은 평소보다 훨씬 좋은 조건으로 진행됩니다"},
            {"label": "크게 준비",     "tail": "이번 달은 혜택을 꽤 크게 준비했습니다"},
            {"label": "더 많이",       "tail": "원래보다 더 많이 드리는 기간입니다"},
            # 톤 3: 손실회피·비용 고민형 (손해방지 + 비용고민 통합)
            {"label": "지나가면 손해", "tail": "모르고 지나가면 손해입니다"},
            {"label": "확인 X",        "tail": "지금 확인하지 않으면 놓칠 수 있습니다"},
            {"label": "넘기 아까움 2", "tail": "그냥 넘기기 아쉬운 혜택입니다"},
            {"label": "미루셨다면",    "tail": "미루셨다면 이번이 기회입니다"},
            {"label": "망설이셨다면",  "tail": "망설이셨다면 꼭 확인해보세요"},
            {"label": "포기 아까움",   "tail": "포기하기엔 아까운 혜택입니다"},
            {"label": "좋아할 조건",   "tail": "고민했던 분들이 가장 좋아할 조건입니다"},
            {"label": "고민 X 놓침",   "tail": "고민만 하다 놓치지 마세요"},
            # 톤 4: 부담제거·상담 유도형 (상담유도 + 즉시행동 통합)
            {"label": "상담만",        "tail": "상담만 받아보셔도 괜찮습니다"},
            {"label": "문의만",        "tail": "문의만 하셔도 혜택 확인이 가능합니다"},
            {"label": "부담 X 확인",   "tail": "부담 없이 먼저 확인해보세요"},
            {"label": "상담 후 결정",  "tail": "결정은 상담 후에 하셔도 됩니다"},
            {"label": "편하게",        "tail": "편하게 물어보셔도 됩니다"},
            {"label": "1분 확인",      "tail": "1분이면 혜택 확인이 가능합니다"},
            {"label": "간단 문의",     "tail": "간단한 문의로 적용 여부를 확인하세요"},
            {"label": "어렵지 X",      "tail": "신청은 어렵지 않습니다"},
            # 톤 5: 호기심 유발형 (궁금증 유발 단독)
            {"label": "아쉬운 이유",   "tail": "그냥 넘기면 아쉬운 이유"},
            {"label": "문의 증가",     "tail": "왜 지금 문의가 늘고 있을까요"},
            {"label": "혜택 좋은 이유", "tail": "이번 달 혜택이 유독 좋은 이유"},
            {"label": "바로 결정",     "tail": "많은 분들이 이 조건에서 바로 결정하십니다"},
            {"label": "많이 묻는",     "tail": "가장 많이 물어보는 혜택"},
            {"label": "놓치는 혜택",   "tail": "생각보다 많은 분들이 놓치는 혜택입니다"},
            {"label": "중요한 부분",   "tail": "이벤트 내용보다 더 중요한 부분이 있습니다"},
            {"label": "꼭 확인",       "tail": "상담 전에 꼭 확인해야 할 조건"},
        ],
    },
}


def ensure_builtin_seeds():
    """첫 기동 시 builtin 시드를 주입. 같은 ID가 이미 있으면 덮어쓰지 않음 (idempotent).

    추가 마이그레이션:
    - templateScope 필드가 없는 기존 레코드에 "info"를 자동 보강 (하위호환).
    - builtin 5장(정보성글)에 titleFormula가 없으면 BUILTIN_TITLE_FORMULAS에서 매칭 ID로 자동 보강.
      사용자 user 레코드는 건드리지 않음.
    """
    records = _load_records()
    existing_ids = {r.get("id") for r in records}
    changed = False
    for seed in BUILTIN_SEEDS:
        if seed["id"] not in existing_ids:
            records.append(seed)
            changed = True
    # templateScope 누락 보강 — 기존 데이터는 모두 정보성글로 간주
    for r in records:
        if "templateScope" not in r or r.get("templateScope") is None:
            r["templateScope"] = "info"
            changed = True
    # titleFormula 누락 보강 — builtin 정보성글 카드에만 매칭 ID로 주입.
    # 사용자(user) 레코드는 AI 분석 단계에서 채워지므로 여기서 건드리지 않음.
    for r in records:
        if not r.get("isBuiltin"):
            continue
        if r.get("titleFormula"):
            continue
        formula = BUILTIN_TITLE_FORMULAS.get(r.get("id"))
        if formula:
            r["titleFormula"] = formula
            changed = True
    if changed:
        _save_records(records)
