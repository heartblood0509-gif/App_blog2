// 매뉴얼 본문 가독성: 문장 끝(. ! ?)마다 자동으로 줄바꿈(<br/>)을 넣는다.
//
// 한국어 매뉴얼은 한 문단에 여러 문장이 흐르면 읽기 어렵다. 이 헬퍼는
// manual-ui의 본문 컴포넌트(PageIntro / Section / ManualFooterNote)에서 호출되어,
// 페이지를 일일이 수정하지 않아도 모든 문장 경계에 줄바꿈을 넣어준다.
//
// 처리 규칙:
//   1) 한 텍스트 안의 "문장. 다음문장" → 문장부호 뒤 공백을 <br/> 로 치환
//   2) 형제 경계: 앞 노드가 문장부호로 끝나고 다음 형제가 이어지면 그 사이에 <br/>
//      (예: "...도구입니다.{' '}<strong>...</strong>" 형태)
//   - 소수점(1.0)·URL(...docs/billing)처럼 마침표 뒤에 공백이 없으면 끊지 않는다.
//   - 자식이 없는 컴포넌트(StageHeading 등)·이미 있는 <br/>는 건드리지 않는다.

import React from "react";

// 문장 끝 판정. 단, 말줄임표(...)는 제외하려고 직전 글자가 마침표가 아닐 것을 요구.
const ENDS_SENTENCE = /[^.][.!?]["”’)]?$/;

function isBr(node: React.ReactNode): boolean {
  return React.isValidElement(node) && node.type === "br";
}

// 문자열 내부를 문장 단위로 분리하고, 끝 문장부호 여부를 함께 반환
function splitInline(
  str: string,
  keyBase: string
): { nodes: React.ReactNode[]; endedSentence: boolean } {
  // 문장부호 + 공백에서 분할. 단, 말줄임표(...)는 직전 글자가 마침표가 아닐 것을 요구해 제외.
  const parts = str.split(/(?<=[^.][.!?])[ \t]+/);
  const nodes: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) nodes.push(<br key={`${keyBase}-ibr-${i}`} />);
    if (p) nodes.push(p);
  });
  const tail = str.replace(/\s+$/, "");
  return { nodes, endedSentence: ENDS_SENTENCE.test(tail) };
}

function walk(
  node: React.ReactNode,
  key: string
): { nodes: React.ReactNode[]; endedSentence: boolean } {
  if (typeof node === "string") {
    return splitInline(node, key);
  }
  if (isBr(node)) {
    return { nodes: [node], endedSentence: false };
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    // 자식이 없는 요소(StageHeading 등)는 그대로 둔다.
    if (props.children == null) {
      return { nodes: [node], endedSentence: false };
    }
    const inner = walkArray(React.Children.toArray(props.children), `${key}-c`);
    const cloned = React.cloneElement(node, { key: node.key ?? key }, inner.nodes);
    return { nodes: [cloned], endedSentence: inner.endedSentence };
  }
  return { nodes: [node], endedSentence: false };
}

function walkArray(
  children: React.ReactNode[],
  key: string
): { nodes: React.ReactNode[]; endedSentence: boolean } {
  const out: React.ReactNode[] = [];
  let pending = false; // 앞 형제가 문장으로 끝났는가
  let lastWasBr = false;

  children.forEach((child, i) => {
    const k = `${key}-${i}`;

    // 공백만 있는 노드(예: {" "})는, 앞이 문장으로 끝났으면 <br/>로 치환
    if (typeof child === "string" && /^\s+$/.test(child)) {
      if (pending && !lastWasBr) {
        out.push(<br key={`${k}-sbr`} />);
        lastWasBr = true;
        pending = false;
      } else {
        out.push(child);
      }
      return;
    }

    // 형제 경계: 앞 문장이 끝났는데 이번 자식이 새로 이어지면 <br/> 삽입
    if (pending && !lastWasBr && !isBr(child)) {
      out.push(<br key={`${k}-sbr`} />);
      lastWasBr = true;
      pending = false;
    }

    const r = walk(child, k);
    out.push(...r.nodes);
    pending = r.endedSentence;
    lastWasBr = isBr(child) || (r.nodes.length > 0 && isBr(r.nodes[r.nodes.length - 1]));
  });

  return { nodes: out, endedSentence: pending };
}

/** 문장 경계마다 줄바꿈을 넣은 children을 반환한다. */
export function withSentenceBreaks(children: React.ReactNode): React.ReactNode {
  return walkArray(React.Children.toArray(children), "sb").nodes;
}
