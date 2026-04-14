import { crawlNaver } from "@/lib/crawlers/naver";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return Response.json({ error: "URL이 필요합니다." }, { status: 400 });
    }

    // 네이버 블로그만 지원
    if (!url.includes("blog.naver.com") && !url.includes("m.blog.naver.com")) {
      return Response.json(
        { error: "현재 네이버 블로그 URL만 지원합니다." },
        { status: 400 }
      );
    }

    const result = await crawlNaver(url);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "크롤링 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
