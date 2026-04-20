/**
 * 이미지 생성 프롬프트 빌더.
 * App_blog_auto2/prompts/image.py의 build_blog_image_prompt를 포팅 + 확장.
 */
import { extractContextSnippet } from "@/lib/image/marker-parser";

/** 텍스트 → 이미지 (Mode 1, AI 전체 생성) */
export function buildTextToImagePrompt(
  description: string,
  blogContent: string,
  imageIndex: number
): string {
  const contextSnippet = extractContextSnippet(blogContent, imageIndex, 500);

  const diffLine =
    imageIndex > 0
      ? "\n8. **이전 이미지와 차별화** — 다른 구도, 다른 앵글, 다른 색감으로 시각적 다양성 확보"
      : "";

  return `당신은 네이버 블로그 본문에 삽입할 이미지 전문 디자이너입니다.
독자가 스크롤을 멈추고 시선을 빼앗기는 고품질 이미지를 1장 생성해주세요.

## 생성할 이미지
${description}

## 이 이미지가 삽입될 본문 맥락
아래는 이미지가 들어갈 위치 앞뒤의 블로그 본문입니다. 이 맥락에 자연스럽게 어울리는 이미지를 생성하세요.
---
${contextSnippet}
---

## 이미지 비율
가로로 넓은 16:9 비율. 네이버 블로그 본문에 최적화된 와이드 이미지.

## 스타일: 실사 사진 (Photorealistic) — 반드시 준수
- 반드시 실제 DSLR 카메라로 촬영한 것처럼 사실적인(photorealistic) 이미지를 생성하세요
- 일러스트, 만화, 애니메이션, 수채화, 디지털 아트 스타일은 절대 금지
- 모든 이미지가 동일한 실사 사진 스타일로 일관되어야 합니다

## 이미지 품질 기준
1. **텍스트/글자/워터마크 절대 금지** — 이미지 안에 어떤 문자도 넣지 마세요
2. **즉각적 시선 유도** — 독자가 스크롤하다 멈출 만큼 시각적으로 매력적이어야 합니다
3. **본문 맥락과 정확히 일치** — 위 본문에서 설명하는 상황, 감정, 사물을 직접 시각화하세요
4. **실제 촬영 느낌** — 85mm 포트레이트 렌즈 또는 35mm 광각 렌즈로 촬영한 느낌. 얕은 피사계 심도(배경 블러)
5. **인물은 반드시 동양인/한국인** — 피부톤, 헤어스타일, 체형 모두 한국인 기준
6. **조명과 분위기** — 자연광 또는 부드러운 간접 조명. 전체적으로 밝고 따뜻한 톤
7. **고해상도, 선명한 초점** — 주요 피사체에 선명한 초점, 배경은 자연스럽게 블러${diffLine}

정확히 1장의 완성된 이미지만 생성하세요.`;
}

/**
 * 이미지 → 이미지 (Mode 2, 실사 사진을 AI로 변환).
 * Gemini 공식 편집 템플릿 기반:
 *   "Edit this image: [change]. Preserve all other elements."
 *
 * 첨부된 사용자의 원본 사진을 "거의 그대로" 살린 채, 지시에 맞춰 미세 조정한다.
 * 인물 정체성·의상은 반드시 유지한다.
 */
export function buildImageToImagePrompt(
  description: string,
  userInstruction: string,
  blogContent: string,
  imageIndex: number
): string {
  const contextSnippet = extractContextSnippet(blogContent, imageIndex, 300);
  const hasInstruction = userInstruction.trim().length > 0;
  const editInstruction = hasInstruction
    ? userInstruction.trim()
    : "Slightly adjust the camera angle (±10°) and tidy up 1~2 background details only. No other changes.";

  const variationNote =
    imageIndex > 0
      ? "\n## Variation note\nPrevious frames already exist. Add small variation (different angle or expression), but keep identity IDENTICAL to the reference."
      : "";

  return `Edit the provided reference photo of this Korean person.

## What to change
${editInstruction}

## What MUST be preserved (DO NOT change)
- Face identity: eyes, nose, mouth, jawline, skin tone, age, gender — exactly the same person
- Hair: color, length, and overall style (only stray hairs may differ)
- Clothing and accessories: exact colors, shapes, patterns, glasses, jewelry
- Lighting direction and type (natural/indoor, same light source direction)
- Color grading and white balance
- Camera distance (close-up stays close-up, full-shot stays full-shot)

## Allowed micro-adjustments (only within this scope)
- Camera angle: ±5~15° rotation only
- Expression and gaze: subtle smile or gaze direction change
- Background: 1~2 items may be tidied or replaced with same-style props
- Pose: small variation (e.g., both hands → one hand)

## Scene description (Korean blog context)
${description}

## Nearby blog content (for scene interpretation only — DO NOT let this override the reference photo)
---
${contextSnippet}
---

## CRITICAL RULES
- The result MUST look like the NEXT FRAME from the same photo shoot — same person, same clothes, same location, same lighting.
- DO NOT generate a new scene, different location, different outfit, or a different person.
- DO NOT make it an illustration, cartoon, anime, painting, or digital art. Photorealistic DSLR photo only.
- DO NOT add any text, watermark, logo, or caption.
- If the user's instruction conflicts with identity preservation, preserve the identity first.${variationNote}

## Output
Exactly 1 photorealistic image, 16:9 aspect ratio.`;
}

/**
 * 안전 필터에 걸린 프롬프트를 중립화하여 1회 재시도용으로 재작성.
 * 감정/신체 묘사, 강한 형용사 등을 빼고 장소·사물 중심으로 단순화한다.
 */
export function buildNeutralizedPrompt(description: string): string {
  // 민감 키워드 제거/대체
  const neutralDesc = description
    .replace(/스트레스|우울|좌절|절망|불안|고통/g, "일상")
    .replace(/피부|두피|머리카락|가려움|발진|여드름/g, "일상 소품")
    .replace(/얼굴|몸|포즈|인물/g, "사물")
    .trim();

  return `네이버 블로그 본문용 실사 감성 사진 1장을 생성해주세요.

## 피사체
${neutralDesc || "블로그 본문 분위기에 맞는 일상적 정물 또는 풍경"}

## 스타일
- 실사 사진 (DSLR 촬영 느낌)
- 16:9 가로 비율
- 자연광, 따뜻한 톤
- 텍스트·글자·워터마크 없음
- 고해상도, 선명한 초점, 배경 블러

정확히 1장의 이미지만 생성하세요.`;
}
