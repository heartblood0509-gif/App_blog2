import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 사용자 입력을 정규식 리터럴로 안전하게 쓰기 위해 메타문자를 이스케이프한다.
 * 이스케이프 없이 `new RegExp(userInput)` 하면 괄호·대괄호 등에서 SyntaxError 가 나거나
 * (`.`·`|` 등은) 조용히 의미가 바뀌어 매칭이 오작동한다.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
