/**
 * 브랜드 글 생성 — 템플릿별 dispatch 진입점.
 */
import type {
  BrandProfile,
  BrandTemplateId,
  BrandInfoVariantId,
  BrandIntroVariantId,
  BrandValueProofVariantId,
  BrandDetailVariantId,
  AnalysisRecord,
} from "@/types/brand";
import { buildIntroPrompt } from "./templates/intro/prompt";
import { buildIntroStructureBasedPrompt } from "./templates/intro/intro-structure-based/prompt";
import { buildIntroCustomPrompt } from "./templates/intro/intro-custom/prompt";
import { buildInfo1Prompt } from "./templates/info/info-1/prompt";
import { buildInfo2Prompt } from "./templates/info/info-2/prompt";
import { buildInfo3Prompt } from "./templates/info/info-3/prompt";
import { buildInfo4Prompt } from "./templates/info/info-4/prompt";
import { buildInfo5Prompt } from "./templates/info/info-5/prompt";
import { buildInfoCustomPrompt } from "./templates/info/info-custom/prompt";
import { buildInfoStructureBasedPrompt } from "./templates/info/info-structure-based/prompt";
import { buildValueProofPrompt } from "./templates/value-proof/prompt";
import { buildValueProofStructureBasedPrompt } from "./templates/value-proof/value-proof-structure-based/prompt";
import { buildValueProofCustomPrompt } from "./templates/value-proof/value-proof-custom/prompt";
import { buildDetailStructureBasedPrompt } from "./templates/detail/detail-structure-based/prompt";
import { buildDetailCustomPrompt } from "./templates/detail/detail-custom/prompt";

export interface BuildBrandPromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: BrandInfoVariantId | null;
  /** 소개글 변형 — Step B에서 dispatch 분기 추가 예정 */
  introVariantId?: BrandIntroVariantId | null;
  /** 가치입증글 변형 — Step C에서 dispatch 분기 추가 예정 */
  valueProofVariantId?: BrandValueProofVariantId | null;
  /** 상세페이지글 변형 — Step C에서 dispatch 분기 추가 예정 */
  detailVariantId?: BrandDetailVariantId | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** info-custom 모드 전용 — 사용자가 제공한 견본 글 본문 (톤 통계 추출 입력) */
  referenceText?: string;
  /** info-custom 모드 전용 — 견본 글 구조 분석 결과 (마크다운) */
  referenceAnalysis?: string;
  /** info-custom 모드 전용 — 분석에서 추출된 본보기 문장 (어미 패턴 통계로만 변환됨) */
  referenceExcerpts?: string[];
  /** structure-based 모드 전용 — 보관함에서 선택된 분석 레코드 ID (info/intro/value-proof/detail 공통) */
  analysisRecordId?: string;
  /** structure-based 모드 전용 — API 라우트가 백엔드에서 fetch한 분석 레코드 */
  analysisRecord?: AnalysisRecord;
}

export function buildBrandGenerationPrompt(opts: BuildBrandPromptOptions): string {
  const { template, infoVariantId, introVariantId, valueProofVariantId, detailVariantId } = opts;

  switch (template) {
    case "intro":
      if (introVariantId === "intro-structure-based") {
        if (!opts.analysisRecord) {
          throw new Error("[소개글 서사 구조 기반] 모드는 보관함에서 분석을 선택해야 합니다.");
        }
        return buildIntroStructureBasedPrompt({ ...opts, analysisRecord: opts.analysisRecord });
      }
      if (introVariantId === "intro-custom") return buildIntroCustomPrompt(opts);
      // variant 미선택 시 기존 buildIntroPrompt 호출 (Step A 호환, Step B 마이그레이션 검증 후 제거 예정)
      return buildIntroPrompt(opts);
    case "info":
      if (infoVariantId === "info-structure-based") {
        if (!opts.analysisRecord) {
          throw new Error("[서사 구조 기반 작성] 모드는 보관함에서 분석을 선택해야 합니다.");
        }
        return buildInfoStructureBasedPrompt({ ...opts, analysisRecord: opts.analysisRecord });
      }
      if (infoVariantId === "info-custom") return buildInfoCustomPrompt(opts);
      if (infoVariantId === "info-5") return buildInfo5Prompt(opts);
      if (infoVariantId === "info-1" || !infoVariantId) return buildInfo1Prompt(opts);
      if (infoVariantId === "info-2") return buildInfo2Prompt(opts);
      if (infoVariantId === "info-3") return buildInfo3Prompt(opts);
      if (infoVariantId === "info-4") return buildInfo4Prompt(opts);
      throw new Error(`알 수 없는 정보성글 변형: ${infoVariantId}`);
    case "value-proof":
      if (valueProofVariantId === "value-proof-structure-based") {
        if (!opts.analysisRecord) {
          throw new Error("[가치입증글 서사 구조 기반] 모드는 보관함에서 분석을 선택해야 합니다.");
        }
        return buildValueProofStructureBasedPrompt({ ...opts, analysisRecord: opts.analysisRecord });
      }
      if (valueProofVariantId === "value-proof-custom") return buildValueProofCustomPrompt(opts);
      // variant 미선택 시 기존 buildValueProofPrompt 호출 (호환용 fallback)
      return buildValueProofPrompt(opts);
    case "detail":
      if (detailVariantId === "detail-structure-based") {
        if (!opts.analysisRecord) {
          throw new Error("[상세페이지글 서사 구조 기반] 모드는 보관함에서 분석을 선택해야 합니다.");
        }
        return buildDetailStructureBasedPrompt({ ...opts, analysisRecord: opts.analysisRecord });
      }
      if (detailVariantId === "detail-custom") return buildDetailCustomPrompt(opts);
      throw new Error("상세페이지글 변형을 선택해주세요.");
    default:
      throw new Error(`알 수 없는 템플릿: ${template}`);
  }
}
