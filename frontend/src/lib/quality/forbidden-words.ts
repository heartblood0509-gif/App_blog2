import type { ForbiddenWordMatch } from "@/types";

// 대체 가능한 금칙어 (대체어 제안 포함)
const FORBIDDEN_REPLACEMENTS: Record<string, string[]> = {
  총: ["전체", "모두", "합계"],
  약: ["대략", "정도", "거의"],
  폭발: ["대인기", "화제", "큰 인기"],
  대박: ["놀라운", "엄청난", "파격"],
  중독: ["빠져들다", "반하다", "매력적"],
  타격: ["영향", "충격", "손실"],
  사망: ["세상을 떠난", "숨진"],
};

// 절대 사용 금지 (카테고리별)
const BANNED_COMMERCIAL = [
  "무료", "공짜", "100%", "최저가", "파격세일", "초특가", "떨이", "땡처리",
];

const BANNED_VIOLENCE = [
  "폭탄", "사살", "살인", "학살", "테러", "마약", "필로폰",
];

const BANNED_GAMBLING = [
  "도박", "카지노", "토토", "슬롯", "배팅", "베팅",
];

const BANNED_MEDICAL = [
  "치료", "완치", "처방", "약효", "부작용",
];

// 1글자 금칙어의 허용 패턴 (이 단어에 포함된 경우 감지하지 않음)
const ALLOWLIST: Record<string, string[]> = {
  약: ["약간", "약속", "약하다", "약하게", "약해", "약한", "계약", "예약", "조약", "약사", "약국", "약을"],
  총: ["총각", "총장", "총무", "총리", "총괄", "총칭", "권총"],
};

function isAllowedContext(text: string, word: string, position: number): boolean {
  const allowedWords = ALLOWLIST[word];
  if (!allowedWords) return false;

  // position 주변 텍스트에서 허용 단어에 포함되는지 확인
  const surrounding = text.slice(Math.max(0, position - 2), position + 4);
  return allowedWords.some((allowed) => surrounding.includes(allowed));
}

export function checkForbiddenWords(text: string): ForbiddenWordMatch[] {
  const matches: ForbiddenWordMatch[] = [];

  // 대체 가능 금칙어 검사
  for (const [word, replacements] of Object.entries(FORBIDDEN_REPLACEMENTS)) {
    if (ALLOWLIST[word]) {
      // 허용 패턴이 있는 단어: 앞뒤 한글 없고 + 허용 목록에 없을 때만 감지
      const regex = new RegExp(`(?<![가-힣])${word}(?![가-힣])`, "g");
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (!isAllowedContext(text, word, match.index)) {
          matches.push({
            word,
            replacement: replacements[0],
            position: match.index,
          });
        }
      }
    } else {
      let idx = text.indexOf(word);
      while (idx !== -1) {
        matches.push({
          word,
          replacement: replacements[0],
          position: idx,
        });
        idx = text.indexOf(word, idx + 1);
      }
    }
  }

  // 절대 금지 단어 검사
  const allBanned = [
    ...BANNED_COMMERCIAL,
    ...BANNED_VIOLENCE,
    ...BANNED_GAMBLING,
    ...BANNED_MEDICAL,
  ];

  for (const word of allBanned) {
    let idx = text.indexOf(word);
    while (idx !== -1) {
      matches.push({
        word,
        replacement: "(삭제 필요)",
        position: idx,
      });
      idx = text.indexOf(word, idx + 1);
    }
  }

  return matches;
}
