import { describe, it, expect } from "vitest";
import { safeUrl, findUrls, remarkChatLinkify } from "../linkify";

// 손으로 만든 mdast 트리에 플러그인을 돌려 결과를 검사(파서 의존 없이).
type N = { type: string; value?: string; url?: string; children?: N[] };
const run = (tree: N): N => {
  remarkChatLinkify()(tree as never);
  return tree;
};
const para = (...children: N[]): N => ({ type: "root", children: [{ type: "paragraph", children }] });
const firstPara = (tree: N): N[] => tree.children![0].children!;

describe("safeUrl", () => {
  it("http/https/mailto/내부경로 허용", () => {
    expect(safeUrl("https://x.com")).toBe("https://x.com");
    expect(safeUrl("http://x.com")).toBe("http://x.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("/help/api-key")).toBe("/help/api-key");
  });
  it("javascript:/data:/vbscript: 차단", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("vbscript:msgbox")).toBeNull();
    expect(safeUrl("")).toBeNull();
  });
});

describe("findUrls", () => {
  it("스킴 없는 도메인 + 경로/포트/쿼리/앵커", () => {
    expect(findUrls("aistudio.google.com/app 에서")[0].href).toBe("https://aistudio.google.com/app");
    expect(findUrls("go example.com:3000/x now")[0].href).toBe("https://example.com:3000/x");
    expect(findUrls("see example.com/a?q=1#f end")[0].href).toBe("https://example.com/a?q=1#f");
  });
  it("스킴 URL 뒤 한글 조사 분리(href에 한글 없음)", () => {
    const h = findUrls("https://ai.google.dev/docs에서 확인");
    expect(h[0].href).toBe("https://ai.google.dev/docs");
    expect(h[0].display).toBe("https://ai.google.dev/docs");
  });
  it("정상 한글 IRI는 보존(조사 아님)", () => {
    const h = findUrls("https://x.com/도움말 보기");
    expect(h[0].href).toBe("https://x.com/도움말");
  });
  it("끝 문장부호/불균형 괄호 제거, 균형 괄호 보존", () => {
    expect(findUrls("(https://x.com/a).")[0].href).toBe("https://x.com/a");
    expect(findUrls("en.wikipedia.org/wiki/Foo_(bar) 참고")[0].href).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)"
    );
  });
  it("오탐 없음: 버전·파일명·Node.js·이메일", () => {
    expect(findUrls("버전 0.2.15 입니다")).toHaveLength(0);
    expect(findUrls("file.txt 와 index.html")).toHaveLength(0);
    expect(findUrls("Node.js 설치")).toHaveLength(0);
    expect(findUrls("메일 user@example.com 으로")).toHaveLength(0);
  });
  it("www. 도 링크", () => {
    expect(findUrls("www.naver.com 으로")[0].href).toBe("https://www.naver.com");
  });
});

describe("remarkChatLinkify (mdast)", () => {
  it("(A) text 내 스킴없는 도메인 → link", () => {
    const t = run(para({ type: "text", value: "발급은 aistudio.google.com/app 에서" }));
    const kids = firstPara(t);
    const link = kids.find((n) => n.type === "link");
    expect(link?.url).toBe("https://aistudio.google.com/app");
    expect(link?.children?.[0].value).toBe("aistudio.google.com/app");
  });
  it("(B) inlineCode URL/경로 → link, 진짜 코드는 유지", () => {
    const t1 = run(para({ type: "inlineCode", value: "/help/api-key" }));
    expect(firstPara(t1)[0].type).toBe("link");
    expect(firstPara(t1)[0].url).toBe("/help/api-key");

    const t2 = run(para({ type: "inlineCode", value: "aistudio.google.com" }));
    expect(firstPara(t2)[0].type).toBe("link");

    const t3 = run(para({ type: "inlineCode", value: "npm run dev" }));
    expect(firstPara(t3)[0].type).toBe("inlineCode"); // 진짜 코드 유지
  });
  it("(C) gfm autolink(한글 흡수) link 보정 → 링크+텍스트 분리", () => {
    const t = run(
      para({
        type: "link",
        url: "https://ai.google.dev/docs%EC%97%90%EC%84%9C",
        children: [{ type: "text", value: "https://ai.google.dev/docs에서" }],
      })
    );
    const kids = firstPara(t);
    expect(kids[0].type).toBe("link");
    expect(kids[0].url).toBe("https://ai.google.dev/docs");
    expect(kids[0].children?.[0].value).toBe("https://ai.google.dev/docs");
    expect(kids[1]).toEqual({ type: "text", value: "에서" });
  });
  it("사람 텍스트 라벨 링크는 안 건드림", () => {
    const t = run(
      para({ type: "link", url: "https://x.com", children: [{ type: "text", value: "여기에서" }] })
    );
    const kids = firstPara(t);
    expect(kids).toHaveLength(1);
    expect(kids[0].children?.[0].value).toBe("여기에서");
  });
  it("코드블록/이미지는 보호(변경 없음)", () => {
    const code: N = { type: "code", value: "curl https://x.com" };
    const tree: N = { type: "root", children: [code] };
    run(tree);
    expect(tree.children![0]).toEqual({ type: "code", value: "curl https://x.com" });

    const img: N = { type: "root", children: [{ type: "paragraph", children: [{ type: "image", url: "https://x.com/a.png" }] }] };
    run(img);
    expect(firstPara(img)[0]).toEqual({ type: "image", url: "https://x.com/a.png" });
  });
  it("보안: text 내 javascript: 는 링크 안 됨", () => {
    const t = run(para({ type: "text", value: "javascript:alert(1) 클릭" }));
    expect(firstPara(t).some((n) => n.type === "link")).toBe(false);
  });
});
