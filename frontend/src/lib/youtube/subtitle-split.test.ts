import { describe, it, expect } from "vitest";
import {
  naturalSplit,
  displayLen,
  chunksForLine,
  parseSubtitleChunks,
  chunksFromWordsGaps,
  hasOverflowChunk,
  wordTimesMatch,
  chunkBoundariesFromWordTimes,
  stripSubtitlePeriods,
  type WordTime,
} from "./subtitle-split";

// 아래 기대값은 백엔드 core/subtitle_utils.py 의 natural_split 실행 결과와 1:1로 맞춘 픽스처.
// (미리보기=최종 영상 보장의 회귀 방지. 백엔드 로직을 바꾸면 여기도 함께 갱신.)
describe("naturalSplit — 백엔드 natural_split 동등성", () => {
  const cases: [string, string[]][] = [
    ["안녕하세요.", ["안녕하세요."]],
    ["안녕하세요. 저는 곽명근입니다.", ["안녕하세요. 저는", "곽명근입니다."]],
    [
      "오늘은 얼굴이 빨개지는 진짜 이유를 알려드릴게요.",
      ["오늘은 얼굴이 빨개지는", "진짜 이유를", "알려드릴게요."],
    ],
    ["저는 곽명근입니다. 반가워요.", ["저는 곽명근입니다.", "반가워요."]],
    [
      "얼굴이 빨개지는데 이유를 모르겠어요, 정말 답답하죠.",
      ["얼굴이 빨개지는데", "이유를 모르겠어요,", "정말 답답하죠."],
    ],
    [
      "이것은아주긴한단어인데띄어쓰기가전혀없는경우",
      ["이것은아주긴한단어인데띄어쓰기가전혀없는경우"],
    ],
  ];
  for (const [input, expected] of cases) {
    it(input, () => expect(naturalSplit(input)).toEqual(expected));
  }
});

describe("displayLen — 구두점 제외, 공백 포함", () => {
  it("구두점은 길이에서 빠진다", () => {
    expect(displayLen("안녕하세요.")).toBe(5);
    expect(displayLen("이유를 모르겠어요,")).toBe(9); // 3 + 1(공백) + 5
  });
});

describe("chunksForLine — override 우선", () => {
  it("확정 조각이 있으면 그대로", () => {
    expect(chunksForLine("안녕하세요. 저는 곽명근입니다.", ["안녕하세요.", "저는 곽명근입니다."])).toEqual([
      "안녕하세요.",
      "저는 곽명근입니다.",
    ]);
  });
  it("override 없으면 자동 분할, 빈 텍스트는 빈 배열", () => {
    expect(chunksForLine("안녕하세요.", null)).toEqual(["안녕하세요."]);
    expect(chunksForLine("   ", null)).toEqual([]);
  });
});

describe("parseSubtitleChunks / chunksFromWordsGaps — 컷·화면줄바꿈 왕복", () => {
  it("컷 경계는 cut, 조각 안 개행은 wrap, 공백은 space", () => {
    const chunks = ["이 저가\n상품이", "생각보다 좋아요"];
    const p = parseSubtitleChunks(chunks);
    expect(p.words).toEqual(["이", "저가", "상품이", "생각보다", "좋아요"]);
    // 이|저가(space) 저가|상품이(wrap) 상품이|생각보다(cut) 생각보다|좋아요(space)
    expect(p.gaps).toEqual(["space", "wrap", "cut", "space"]);
    expect(p.segOfWord).toEqual([0, 0, 0, 1, 1]); // 앞 세 어절 = 컷0, 뒤 둘 = 컷1
    expect(p.lineOfWord).toEqual([0, 0, 1, 2, 2]); // "이 저가" / "상품이" / "생각보다 좋아요"
  });
  it("파서 → 역변환 라운드트립", () => {
    const chunks = ["이 저가\n상품이", "생각보다 좋아요"];
    const p = parseSubtitleChunks(chunks);
    expect(chunksFromWordsGaps(p.words, p.gaps)).toEqual(chunks);
  });
  it("간격 없으면 한 조각 한 줄", () => {
    expect(chunksFromWordsGaps(["a", "b", "c"], ["space", "space"])).toEqual(["a b c"]);
  });
  it("cut 은 조각을, wrap 은 화면 줄을 만든다", () => {
    expect(chunksFromWordsGaps(["a", "b", "c"], ["cut", "wrap"])).toEqual(["a", "b\nc"]);
  });
});

describe("hasOverflowChunk", () => {
  it("12자 초과 조각 감지", () => {
    expect(hasOverflowChunk(["짧은 자막"])).toBe(false);
    expect(hasOverflowChunk(["이것은아주긴한단어인데띄어쓰기가전혀없는경우"])).toBe(true);
  });
  it("개행(화면 줄바꿈)은 줄별로 검사 — 각 줄이 짧으면 통과", () => {
    // 한 덩어리로는 12자 초과지만 두 줄로 나누면 각 줄은 12자 이하.
    expect(hasOverflowChunk(["가나다라마바사\n아자차카타파하"])).toBe(false);
    expect(hasOverflowChunk(["가나다라마바사아자차카타파하"])).toBe(true);
  });
});

// 백엔드 core/subtitle_utils.py 의 _word_chunk_segments 규칙과 정합.
describe("chunkBoundariesFromWordTimes", () => {
  const wt: WordTime[] = [
    { text: "안녕하세요", start: 0.0, end: 0.6 },
    { text: "저는", start: 0.7, end: 1.0 },
    { text: "곽명근입니다", start: 1.6, end: 2.9 },
  ];
  it("조각 끝 = 다음 조각 첫 어절 start, 마지막 = duration", () => {
    // bounds 는 줄 시작 기준 '조각별 끝 시각'(재생 훅 chunkBoundaries 와 동일 형태)
    expect(chunkBoundariesFromWordTimes(["안녕하세요 저는", "곽명근입니다"], wt, 3.0)).toEqual([
      1.6, 3.0,
    ]);
  });
  it("단일 조각 → [duration]", () => {
    expect(chunkBoundariesFromWordTimes(["안녕하세요 저는 곽명근입니다"], wt, 3.0)).toEqual([3.0]);
  });
  it("개수 불일치 → null", () => {
    expect(chunkBoundariesFromWordTimes(["안녕하세요"], wt, 3.0)).toBeNull();
  });
  it("문자열 불일치 → null", () => {
    const bad: WordTime[] = [
      { text: "가", start: 0, end: 1 },
      { text: "나", start: 1, end: 2 },
    ];
    expect(chunkBoundariesFromWordTimes(["가", "다"], bad, 2.0)).toBeNull();
  });
  it("start 역행 → null", () => {
    const bad: WordTime[] = [
      { text: "가", start: 0, end: 1 },
      { text: "나", start: 2, end: 2.5 },
      { text: "다", start: 1, end: 3 },
    ];
    expect(chunkBoundariesFromWordTimes(["가", "나", "다"], bad, 3.0)).toBeNull();
  });
  it("어절 end 가 duration 초과 시 클램프(경계는 duration 이하·단조)", () => {
    const wt2: WordTime[] = [
      { text: "가", start: 0.0, end: 0.5 },
      { text: "나", start: 5.0, end: 6.0 }, // duration 보다 큰 start
    ];
    const b = chunkBoundariesFromWordTimes(["가", "나"], wt2, 2.0)!;
    expect(b[0]).toBeLessThanOrEqual(2.0);
    expect(b[1]).toBe(2.0);
  });
  it("카드 A 끝 마침표 허용", () => {
    expect(
      wordTimesMatch(["안녕하세요", "곽명근입니다"], [
        { text: "안녕하세요", start: 0, end: 0.6 },
        { text: "곽명근입니다.", start: 0.7, end: 1.5 },
      ]),
    ).toBe(true);
  });
});

// 자막 전용 띄어쓰기 — 발화 한 어절("피부장벽이")이 자막에선 여러 어절("피부 장벽이").
// 백엔드 _word_chunk_segments 의 글자 누적 매핑과 정합.
describe("자막 전용 띄어쓰기(발화 어절 안 경계)", () => {
  const wt: WordTime[] = [
    { text: "홍조의", start: 0.0, end: 0.5 },
    { text: "원인은", start: 0.6, end: 1.1 },
    { text: "피부장벽이", start: 1.3, end: 2.3 },
    { text: "무너졌기", start: 2.4, end: 3.0 },
    { text: "때문입니다.", start: 3.1, end: 3.8 },
  ];
  it("어절 수가 달라도 문자열이 같으면 정합", () => {
    expect(
      wordTimesMatch(["홍조의 원인은", "피부 장벽이 무너졌기 때문입니다."], wt),
    ).toBe(true);
  });
  it("경계가 발화 어절 시작에 떨어지면 그 어절의 start(기존 규칙 유지)", () => {
    expect(
      chunkBoundariesFromWordTimes(
        ["홍조의 원인은", "피부 장벽이 무너졌기 때문입니다."],
        wt,
        4.0,
      ),
    ).toEqual([1.3, 4.0]);
  });
  it("경계가 발화 어절 '안'이면 글자 비율 보간", () => {
    // "피부|장벽이": 피부장벽이(5자, 1.3~2.3) 의 2/5 지점 → 1.3 + 1.0×0.4 = 1.7
    const b = chunkBoundariesFromWordTimes(
      ["홍조의 원인은 피부", "장벽이 무너졌기 때문입니다."],
      wt,
      4.0,
    )!;
    expect(b[0]).toBeCloseTo(1.7, 5);
    expect(b[1]).toBe(4.0);
  });
});

// 백엔드 subtitle_utils.py 의 strip_subtitle_periods 와 규칙 동일해야 함(미리보기=최종 영상).
describe("stripSubtitlePeriods — 마침표 제거(소수점 보존)", () => {
  it("문장 끝 마침표 제거", () => {
    expect(stripSubtitlePeriods("때문입니다.")).toBe("때문입니다");
    expect(stripSubtitlePeriods("5만.")).toBe("5만");
  });
  it("여러 마침표(생략부호)도 제거", () => {
    expect(stripSubtitlePeriods("안녕...")).toBe("안녕");
  });
  it("소수점은 보존", () => {
    expect(stripSubtitlePeriods("3.5")).toBe("3.5");
    expect(stripSubtitlePeriods("가격은 3.5%입니다.")).toBe("가격은 3.5%입니다");
    expect(stripSubtitlePeriods("0.5초")).toBe("0.5초");
  });
  it("마침표 없으면 그대로", () => {
    expect(stripSubtitlePeriods("사라집니다")).toBe("사라집니다");
  });
});
