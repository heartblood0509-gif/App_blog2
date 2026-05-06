# 상세페이지글 — 준비중

이 템플릿은 사용자가 레퍼런스 글을 제공한 후 활성화됩니다.

활성화 절차:
1. 사용자가 상세페이지글 레퍼런스 1편 제공
2. `templates/detail/reference.ts` 작성
3. `templates/detail/prompt.ts` 작성 (구매 전환형 골격)
4. `components/brand/brand-template-section.tsx` 의 detail 항목 `enabled: false → true`

현재 UI에서는 회색 비활성 카드 + "준비 중" 뱃지로 노출됨.
