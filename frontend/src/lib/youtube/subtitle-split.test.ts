import { describe, it, expect } from "vitest";
import {
  naturalSplit,
  displayLen,
  chunksForLine,
  wordsOf,
  breakSetFromChunks,
  chunksFromBreaks,
  gapKinds,
  hasOverflowChunk,
  wordTimesMatch,
  chunkBoundariesFromWordTimes,
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

describe("break/chunk 왕복 변환", () => {
  it("chunks → breakSet → chunks 라운드트립", () => {
    const chunks = ["안녕하세요. 저는", "곽명근입니다."];
    const words = wordsOf("안녕하세요. 저는 곽명근입니다.");
    const breaks = breakSetFromChunks(chunks);
    expect(breaks).toEqual(new Set([2]));
    expect(chunksFromBreaks(words, breaks)).toEqual(chunks);
  });
  it("끊김 없으면 한 조각", () => {
    const words = ["a", "b", "c"];
    expect(chunksFromBreaks(words, new Set())).toEqual(["a b c"]);
  });
  it("모든 어절 사이 끊으면 어절 수만큼", () => {
    const words = ["a", "b", "c"];
    expect(chunksFromBreaks(words, new Set([1, 2]))).toEqual(["a", "b", "c"]);
  });
});

describe("hasOverflowChunk", () => {
  it("12자 초과 조각 감지", () => {
    expect(hasOverflowChunk(["짧은 자막"])).toBe(false);
    expect(hasOverflowChunk(["이것은아주긴한단어인데띄어쓰기가전혀없는경우"])).toBe(true);
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

describe("gapKinds — 자막 간격 분류", () => {
  it("발화 어절 안에서 생긴 간격만 split", () => {
    expect(gapKinds(["홍조의", "피부장벽이"], ["홍조의", "피부", "장벽이"])).toEqual([
      "natural",
      "natural",
      "split",
    ]);
  });
  it("동일하면 전부 natural", () => {
    expect(gapKinds(["가", "나"], ["가", "나"])).toEqual(["natural", "natural"]);
  });
  it("글자 단위 정렬 불가면 null", () => {
    expect(gapKinds(["가나"], ["가", "다"])).toBeNull();
    expect(gapKinds(["가"], ["가", "나"])).toBeNull();
  });
});
