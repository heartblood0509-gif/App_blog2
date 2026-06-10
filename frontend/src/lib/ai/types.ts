// AI 제공자 추상화의 공통 타입. gemini-provider / openai-provider / 파사드(gemini.ts)가 공유한다.
// 기존 호출처는 "@/lib/gemini" 에서 이 타입들을 import 하므로, gemini.ts 가 그대로 re-export 한다.

/** 챗봇 대화 한 턴 (시스템 프롬프트는 별도 전달). */
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** 멀티모달 채팅용 파트 (텍스트 또는 인라인 이미지). */
export type ChatPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

/** 이미지 첨부가 가능한 챗봇 대화 한 턴. */
export interface MultimodalTurn {
  role: "user" | "model";
  parts: ChatPart[];
}

/**
 * 일괄 텍스트 생성용 선택적 설정.
 * 결정론적 출력이 필요한 변환·치환 작업에서 temperature=0 / topP / topK / responseMimeType
 * 같은 옵션을 전달하기 위해 사용 (기본 호출은 생략으로 SDK 기본값 그대로).
 */
export interface GenerateTextConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  responseMimeType?: string;
}

export interface GeneratedImageResult {
  /** base64 (data URL prefix 없음) */
  base64: string;
  /** 예: "image/png" */
  mimeType: string;
}

/** 호출처가 넘기는 Gemini 모델 문자열을 환원할 "역할". OpenAI 실제 모델 선택에 쓴다. */
export type AiRole =
  | "generation"
  | "analysis"
  | "image"
  | "imagePro"
  | "transformSubject";
