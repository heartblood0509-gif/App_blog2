import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface ArticleResult {
  title: string;
  content: string;
  platform: string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export async function extractArticle(
  url: string
): Promise<ArticleResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (
    !article ||
    !article.textContent ||
    article.textContent.trim().length < 100
  ) {
    return null;
  }

  return {
    title: (article.title || "").trim(),
    content: article.textContent.trim(),
    platform: parsed.hostname,
  };
}
