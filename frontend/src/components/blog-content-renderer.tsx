"use client";

import React from "react";

/**
 * 블로그 글을 깔끔하게 렌더링하는 공용 컴포넌트
 * 마크다운 기호를 제거하고 블로그 스타일로 표시
 */
export function BlogContentRenderer({ text }: { text: string }) {
  if (!text) return null;

  return (
    <div className="space-y-0">
      {text.split("\n").map((line, i) => {
        // > 인용구 → 소제목 스타일
        if (line.startsWith("> ")) {
          const content = line.replace(/^>\s*/, "");
          return (
            <div
              key={i}
              className="my-6 border-l-4 border-primary/60 bg-primary/5 px-4 py-3"
            >
              <p className="text-base font-semibold leading-relaxed">
                {renderInlineStyles(content)}
              </p>
            </div>
          );
        }

        // ## 헤딩 → 큰 소제목
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="mb-3 mt-8 text-lg font-bold first:mt-0">
              {renderInlineStyles(line.replace(/^##\s*/, ""))}
            </h2>
          );
        }

        // ### 헤딩 → 중간 소제목
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="mb-2 mt-6 text-base font-semibold first:mt-0">
              {renderInlineStyles(line.replace(/^###\s*/, ""))}
            </h3>
          );
        }

        // 해시태그 줄 (#태그1 #태그2 ...)
        if (line.startsWith("#") && !line.startsWith("##")) {
          const tags = line.split(/\s+/).filter((t) => t.startsWith("#"));
          if (tags.length > 1) {
            return (
              <div key={i} className="mt-6 flex flex-wrap gap-2">
                {tags.map((tag, j) => (
                  <span
                    key={j}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            );
          }
        }

        // 빈 줄 → 문단 여백
        if (line.trim() === "") {
          return <div key={i} className="h-3" />;
        }

        // 일반 텍스트
        return (
          <p key={i} className="text-sm leading-7">
            {renderInlineStyles(line)}
          </p>
        );
      })}
    </div>
  );
}

/** **볼드**, *이탤릭* 등 인라인 스타일 처리 */
function renderInlineStyles(text: string): React.ReactNode {
  // **볼드** 처리
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    // *이탤릭* 처리
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return (
        <em key={i}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
