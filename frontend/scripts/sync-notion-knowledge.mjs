// 노션 So-Pick 가이드 → 검토용 마크다운으로 한 번에 수집 (운영안 A: 갱신용).
//
// 사용: npm run sync:notion
//   → frontend/notion-export/sopick-guide.md 를 새로 생성한다.
//   이 파일을 보고 노션의 최신 내용을 /help 매뉴얼에 반영하면 된다.
//   (챗봇에 자동 주입하지 않으므로 Gemini 비용에는 영향이 없다.)
//
// 비공식 Notion API(loadPageChunk / queryCollection)를 사용한다. 공개 페이지 전용.
// 중첩 DB(쇼츠픽 사용가이드 안의 하위 페이지 등)와 중복 페이지(A/B)도 자동 처리.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "notion-export");
const OUT_FILE = join(OUT_DIR, "sopick-guide.md");

const SPACE = "2aad81dc-e20d-40f6-90a6-522c14482d5c";
const ROOT_COLLECTION = "36f2aa17-591b-8006-8feb-000bc2b2c16f";
const ROOT_VIEW = "36f2aa17-591b-80aa-8542-000cc68cb670";
const LOAD = "https://www.notion.so/api/v3/loadPageChunk";
const QUERY = "https://www.notion.so/api/v3/queryCollection?src=initial_load";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// 한 페이지의 모든 블록을 페이지네이션으로 로드
async function loadPage(pageId) {
  const blocks = {};
  let cursor = { stack: [] };
  for (let i = 0; i < 30; i++) {
    const j = await postJson(LOAD, {
      pageId,
      limit: 100,
      cursor,
      chunkNumber: i,
      verticalColumns: false,
    });
    Object.assign(blocks, j.recordMap?.block || {});
    cursor = j.cursor;
    if (!cursor?.stack?.length) break;
  }
  return blocks;
}

// 컬렉션을 쿼리해 그 안의 page id 목록을 반환
async function queryCollection(collectionId, viewId) {
  const j = await postJson(QUERY, {
    source: { type: "collection", id: collectionId, spaceId: SPACE },
    collectionView: { id: viewId, spaceId: SPACE },
    loader: {
      type: "reducer",
      reducers: { collection_group_results: { type: "results", limit: 300 } },
      searchQuery: "",
      userTimeZone: "Asia/Seoul",
    },
  });
  const ids = [];
  for (const [id, rec] of Object.entries(j.recordMap?.block || {})) {
    if (rec?.value?.value?.type === "page") ids.push(id);
  }
  return ids;
}

const text = (arr) =>
  Array.isArray(arr)
    ? arr.map((s) => (Array.isArray(s) ? s[0] : "")).join("")
    : "";
const decode = (s) =>
  s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

const PREFIX = {
  header: "# ", sub_header: "## ", sub_sub_header: "### ",
  bulleted_list: "- ", numbered_list: "1. ", to_do: "- [ ] ",
  toggle: "▸ ", quote: "> ", callout: "💡 ",
};

async function main() {
  // 1) 메인 컬렉션 + 발견되는 중첩 컬렉션까지 모든 page id 수집
  const queriedCols = new Set();
  const seenPages = new Set();
  const pageOrder = [];
  const allBlocks = {};

  async function ingestCollection(colId, viewId) {
    if (!colId || !viewId || queriedCols.has(colId)) return;
    queriedCols.add(colId);
    let ids = [];
    try {
      ids = await queryCollection(colId, viewId);
    } catch (e) {
      console.warn(`  [경고] 컬렉션 ${colId} 쿼리 실패: ${e.message}`);
      return;
    }
    for (const id of ids) {
      if (!seenPages.has(id)) {
        seenPages.add(id);
        pageOrder.push(id);
      }
    }
  }

  await ingestCollection(ROOT_COLLECTION, ROOT_VIEW);

  // 2) 각 페이지 로드 + 페이지 안의 중첩 컬렉션 발견 시 추가 수집 (최대 3라운드)
  for (let round = 0; round < 3; round++) {
    const toLoad = pageOrder.filter((id) => !allBlocks[id]);
    if (toLoad.length === 0) break;
    for (const pid of toLoad) {
      let blocks;
      try {
        blocks = await loadPage(pid);
      } catch (e) {
        console.warn(`  [경고] 페이지 ${pid} 로드 실패: ${e.message}`);
        allBlocks[pid] = null;
        continue;
      }
      for (const [id, rec] of Object.entries(blocks)) {
        const v = rec?.value?.value;
        if (v) allBlocks[id] = v;
      }
      // 중첩 컬렉션 발견
      for (const rec of Object.values(blocks)) {
        const v = rec?.value?.value;
        if (v && (v.type === "collection_view" || v.type === "collection_view_page")) {
          const colId = v.collection_id || v.format?.collection_pointer?.id;
          const viewId = v.view_ids?.[0];
          await ingestCollection(colId, viewId);
        }
      }
    }
  }

  // 3) 제목 기준 중복 페이지 제거 (A/B 사본) — 더 긴 내용을 남김
  const byTitle = new Map();
  for (const pid of pageOrder) {
    const v = allBlocks[pid];
    if (!v) continue;
    const title = text(v.properties?.title).trim() || pid;
    const size = (v.content || []).length;
    const prev = byTitle.get(title);
    if (!prev || size > prev.size) byTitle.set(title, { pid, size });
  }
  const finalPages = [...byTitle.values()].map((x) => x.pid);

  // 4) 마크다운 렌더
  const out = [
    "<!-- 자동 생성: npm run sync:notion -->",
    "<!-- 원본: pickso 노션 So-Pick 가이드 / 이 파일은 /help 매뉴얼 갱신 참고용입니다 -->",
    `<!-- 수집 페이지 ${finalPages.length}개 -->`,
  ];
  const renderSeen = new Set();
  function render(id, depth) {
    if (renderSeen.has(id)) return;
    renderSeen.add(id);
    const v = allBlocks[id];
    if (!v) return;
    const t = v.type;
    const title = decode(text(v.properties?.title)).replace(/\s+/g, " ").trim();
    const cap = decode(text(v.properties?.caption)).replace(/\s+/g, " ").trim();
    if (t === "image") {
      if (cap) out.push(`- (이미지 캡션) ${cap}`);
      // 캡션 없는 스크린샷은 텍스트가 없으므로 건너뜀
    } else if (t === "divider") {
      out.push("---");
    } else if (t === "code") {
      out.push("```\n" + title + "\n```");
    } else if (title) {
      out.push((PREFIX[t] || "") + title);
    }
    for (const c of v.content || []) render(c, depth + 1);
  }
  for (const pid of finalPages) {
    const v = allBlocks[pid];
    if (!v) continue;
    out.push(`\n\n## 📄 ${decode(text(v.properties?.title)).trim()}`);
    renderSeen.add(pid);
    for (const c of v.content || []) render(c, 1);
  }

  const md = out.join("\n");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, md, "utf8");
  console.log(
    `[sync:notion] 페이지 ${finalPages.length}개 / ${md.length}자 → notion-export/sopick-guide.md`
  );
}

main().catch((e) => {
  console.error("[sync:notion] 실패:", e.message);
  process.exitCode = 1;
});
