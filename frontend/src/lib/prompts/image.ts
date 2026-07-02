/**
 * 이미지 생성 프롬프트 빌더.
 * App_blog_auto2/prompts/image.py의 build_blog_image_prompt를 포팅 + 확장.
 */
import { extractContextSnippet } from "@/lib/image/marker-parser";

/** 지원 비율 → 프롬프트에 넣을 비율 설명 문구 (실제 강제는 imageConfig가 담당, 문구는 보조). */
const ASPECT_LINE: Record<string, string> = {
  "16:9": "가로로 넓은 16:9 비율. 네이버 블로그 본문에 최적화된 와이드 이미지.",
  "1:1": "정사각 1:1 비율. 모바일에서 크고 균형 있게 보이는 이미지.",
  "9:16": "세로로 긴 9:16 비율. 모바일 세로 화면을 꽉 채우는 이미지.",
};
function aspectLine(aspectRatio: string): string {
  return ASPECT_LINE[aspectRatio] ?? ASPECT_LINE["1:1"];
}

/** 텍스트 → 이미지 (Mode 1, AI 전체 생성) */
export function buildTextToImagePrompt(
  description: string,
  blogContent: string,
  imageIndex: number,
  aspectRatio: string = "1:1"
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
${aspectLine(aspectRatio)}

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
 * 이미지 → 이미지 (Mode 2, 사용자가 올린 실사 사진을 AI로 미세 변환).
 *
 * 목적: 사진 1장을 여러 글에 그대로 재사용하면 네이버 중복 이슈가 생기므로,
 * 원본 피사체는 거의 그대로 유지한 채 화각/구도/각도만 살짝 바꾼
 * "같은 장면의 다른 컷"을 만든다.
 *
 * 피사체 무관(subject-agnostic) — 인물/제품/피부/음식 등 무엇이든 동일하게 동작.
 * 블로그 본문·AI가 상상한 장면 설명은 일절 주입하지 않는다
 * (이 둘이 원본을 덮어쓰고 전혀 다른 그림을 만들던 주범이었음).
 */
export function buildImageToImagePrompt(
  userInstruction: string,
  subject?: string
): string {
  // subject = 비전 프리패스가 식별한 '실제 사진의 한 줄 피사체 라벨'(블로그 본문/장면이 아님).
  // 있으면 "photo of [subject]" 로 지목 + 보존 규칙에서 재참조해 부위/사물 오인을 막는다.
  const subj = (subject || "").trim();
  const of = subj ? ` of ${subj}` : "";
  const subjectKeep = subj
    ? `the same ${subj} (do not turn it into a different body part, object, or place)`
    : "the same subject";

  // 기본 변경 = 각도 + 거리/프레이밍을 함께(평평한 장면도 눈에 보이게) + "한눈에 달라 보이게" 강제.
  // 사용자 지시란 있으면 그것으로 교체. 인물 단정·블로그 본문·AI 상상장면 주입은 계속 배제.
  // '같은 피사체·같은 장소·새 장면 금지' 빗장으로 발산은 막되, 변형은 보이게(보수화 방지).
  // 비율은 프롬프트가 아니라 config(imageConfig 미지정=원본 비율 보존)가 담당 → 텍스트에서 뺌.
  const change =
    userInstruction.trim() ||
    "Take a clearly different second shot of the same subject: change the camera angle (about 10–20°) and also the framing or distance — step a little closer or further back, or re-crop. The result must look noticeably different from the original at a glance, while obviously remaining the same subject in the same place.";

  return `Edit the attached photo${of}. Treat it as the ground truth and take another shot from the same photo session — clearly ${subjectKeep}, but a visibly different frame.

## What to change (only this)
${change}

## Must stay the same
- The subject: identity, shape, proportions, colors, materials, textures, and any text or labels on it
- The setting: clearly the same place, with the same lighting and color tone

## Critical rules
- It MUST look like another shot of the same subject in the same place — NOT a new scene, a new location, or a re-invented/different subject
- Keep it a real photograph (no illustration, cartoon, anime, painting, or 3D render)
- Do not add any text, watermark, or logo

## Output
Exactly 1 photorealistic image.`;
}

/**
 * AI 변환 프리패스용 — 첨부 사진의 "주된 피사체"를 한 줄로 식별시키는 분석 프롬프트.
 * 블로그 본문 발췌(contextSnippet)는 '사진이 무엇인지' 판단하는 근거로만 쓰고,
 * 장면을 상상하지 않게 한다. (이미지 분석 호출에서 이미지 뒤에 이 텍스트를 붙인다.)
 */
export function buildSubjectDescribePrompt(contextSnippet: string): string {
  const ctx = contextSnippet.trim();
  // 공식 표준 식별 = "Caption this image"(이미지에 담긴 것을 묘사). 피사체 유/무를 구분하지
  // 않는다 — 모델이 보이는 그대로 묘사하므로 신체부위·제품·풍경 모두 한 프롬프트로 커버.
  // '주된 피사체' 같은 피사체 전제 표현을 버리고 '사진에 담긴 것'으로 일반화.
  // 길이 강제(25자)·구체 예시(정답 흘림)는 제거 — 길이는 후처리(한 줄·100자 컷)가 담당.
  // 공식 가이드: 단일 이미지는 [이미지, 텍스트] 순서 + 쿼리는 맥락 '뒤'에 둘 때 정확.
  const ask = `첨부한 사진에 실제로 담긴 것을 한국어로 한 줄로 구체적으로 묘사해주세요.
- 신체 부위가 보이면 어느 부위인지, 제품이면 어떤 제품인지, 풍경/사물이면 어떤 장면인지 — 보이는 그대로.
- 사진에 없는 것은 지어내지 말고, 설명·접두어 없이 묘사만.`;
  if (!ctx) return ask;
  return `아래 글은 첨부한 사진이 무엇인지 알아내기 위한 참고 자료입니다.
---
${ctx}
---

위 글을 참고해서, ${ask}`;
}

/**
 * 안전 필터에 걸린 프롬프트를 중립화하여 1회 재시도용으로 재작성.
 * 감정/신체 묘사, 강한 형용사 등을 빼고 장소·사물 중심으로 단순화한다.
 */
export function buildNeutralizedPrompt(
  description: string,
  aspectRatio: string = "1:1"
): string {
  // 민감 키워드 제거/대체
  const neutralDesc = description
    .replace(/스트레스|우울|좌절|절망|불안|고통/g, "일상")
    .replace(/피부|두피|머리카락|가려움|발진|여드름/g, "일상 소품")
    .replace(/얼굴|몸|포즈|인물/g, "사물")
    .trim();

  const ratioShort: Record<string, string> = {
    "16:9": "16:9 가로 비율",
    "1:1": "1:1 정사각 비율",
    "9:16": "9:16 세로 비율",
  };

  return `네이버 블로그 본문용 실사 감성 사진 1장을 생성해주세요.

## 피사체
${neutralDesc || "블로그 본문 분위기에 맞는 일상적 정물 또는 풍경"}

## 스타일
- 실사 사진 (DSLR 촬영 느낌)
- ${ratioShort[aspectRatio] ?? ratioShort["1:1"]}
- 자연광, 따뜻한 톤
- 텍스트·글자·워터마크 없음
- 고해상도, 선명한 초점, 배경 블러

정확히 1장의 이미지만 생성하세요.`;
}
