// 사용 매뉴얼 랜딩 페이지 — 3 카테고리 카드.
// 사용자가 어디로 가야 할지 한눈에 보이게 큰 카드 + 카테고리 설명.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOC_GROUPS, PRODUCT_ORDER } from "./_components/sections-data";
import { ManualArticle } from "./_components/manual-ui";

// 카테고리별 한 줄 소개 (랜딩 카드 본문)
const GROUP_DESCRIPTIONS: Record<string, string> = {
  "/help/start":
    "블로그픽을 처음 켜기 전에 꼭 알아두실 주의사항과 빠른 점검 체크리스트입니다.",
  "/help/install":
    "Windows·Mac 설치부터 보안경고 통과, 방화벽·백신, 재설치·완전 삭제, 설치 FAQ까지.",
  "/help/usage":
    "후기성 · 브랜드 · AEO 세 가지 글쓰기 모드의 5단계 흐름과 자주 막히는 함정까지.",
  "/help/api-key":
    "Gemini API 키 발급(무료)부터 유료 전환, 선불 결제·429 에러 해결까지.",
  "/help/tools":
    "보관함·브랜드 프로필·제품 관리 같은 부가 도구, 그리고 데이터 백업·PC 이전 가이드.",
  "/help/update":
    "새 버전이 나왔을 때 Windows·Mac에서 받아 설치하는 법과 자주 겪는 문제 해결.",
  "/help/marketing":
    "마케팅 퍼널(고객 구매여정)을 이해하고 브랜드 블로그 글쓰기에 적용하는 법.",
  "/help/shortspick":
    "쇼츠픽이 무엇인지, 그리고 블로그픽 앱으로 통합되는 과정 안내.",
  "/help/shortspick-guide":
    "제목·대본부터 이미지·음성·BGM까지, 쇼츠 영상 한 편을 만드는 5단계.",
  "/help/shortspick-api":
    "제미나이·타입캐스트·FAL API 키 등록과 모델별 비용 정리.",
};

export default function HelpLandingPage() {
  return (
    <ManualArticle>
      <div className="mb-14 rounded-2xl bg-muted/30 px-7 py-6 ring-1 ring-foreground/5">
        <p className="text-[17px] leading-[1.85] text-foreground/80">
          블로그픽 사용 매뉴얼에 오셨습니다.{" "}
          <strong className="font-semibold text-foreground">
            아래 카테고리 중 본인 상황에 맞는 곳을 선택해서 들어가세요.
          </strong>{" "}
          좌측 목차에서도 바로 이동할 수 있습니다.
        </p>
      </div>

      <div className="space-y-10">
        {PRODUCT_ORDER.map((product) => {
          const groups = TOC_GROUPS.filter((g) => g.product === product);
          if (groups.length === 0) return null;
          return (
            <section key={product}>
              <div className="mb-4 flex items-center gap-2.5">
                <span
                  className="block h-5 w-[3px] rounded-full bg-primary"
                  aria-hidden
                />
                <h2 className="font-heading text-[20px] font-bold tracking-tight text-foreground">
                  {product}
                </h2>
              </div>
              <div className="space-y-5">
                {groups.map((group, gi) => (
                  <Link
            key={group.label}
            href={group.page}
            className={cn(
              "group block rounded-2xl px-7 py-6 ring-1 ring-foreground/5 transition-all duration-150",
              "bg-gradient-to-br from-primary/[0.05] via-primary/[0.02] to-transparent",
              "hover:from-primary/[0.10] hover:via-primary/[0.04] hover:ring-primary/20 hover:shadow-sm",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 font-mono text-[12px] font-bold text-primary"
                    aria-hidden
                  >
                    {String(gi + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/50">
                    카테고리
                  </span>
                </div>
                <h2 className="mb-2 font-heading text-[22px] font-semibold tracking-tight text-foreground">
                  {group.label}
                </h2>
                <p className="text-[15.5px] leading-[1.7] text-foreground/70">
                  {GROUP_DESCRIPTIONS[group.page] ?? ""}
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[13.5px] text-foreground/55">
                  {group.items.map((item, i) => (
                    <li
                      key={item.id}
                      className="inline-flex items-center gap-1.5"
                    >
                      {i > 0 && (
                        <span className="text-foreground/25" aria-hidden>
                          ·
                        </span>
                      )}
                      <span>{item.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-foreground/30 transition-all duration-150 group-hover:translate-x-1 group-hover:text-primary" />
            </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ManualArticle>
  );
}
