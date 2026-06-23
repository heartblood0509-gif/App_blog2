import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdaterToast } from "@/components/UpdaterToast";
import { ChatWidget } from "@/components/ChatWidget";
import { AuthSessionProvider } from "@/components/providers/AuthSessionProvider";
import { CloudSyncGate } from "@/components/sync/CloudSyncGate";
import { WizardStateProvider } from "@/components/providers/WizardStateProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Pretendard Variable 셀프호스팅 — Electron 오프라인에서도 동일 폰트 보장.
// CSP `font-src 'self'`가 외부 도메인 차단하므로 동일 출처 필수.
const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  display: "swap",
  variable: "--font-pretendard",
  weight: "45 920",
});

export const metadata: Metadata = {
  title: "Blog Pick",
  description: "자연스러운 후기성 블로그 포스팅을 자동으로 생성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider>
            <AuthSessionProvider>
              <CloudSyncGate />
              <WizardStateProvider>{children}</WizardStateProvider>
            </AuthSessionProvider>
          </TooltipProvider>
          <UpdaterToast />
          <ChatWidget />
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
