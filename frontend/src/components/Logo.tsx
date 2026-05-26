import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: number;
}

// Blog Pick 로고. 파비콘과 동일한 모티프(보라 그라데이션 라운드 사각형 +
// 흰 책갈피 + 보라 체크). 헤더용 32~40px, 파비콘은 src/app/icon.png 별도.
export function Logo({ className, size = 36 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="blogpick-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7B66FF" />
          <stop offset="1" stopColor="#9F7DFF" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#blogpick-bg)" />
      {/* 책갈피(흰색) */}
      <path
        d="M14 9h12a1 1 0 0 1 1 1v22l-7-5-7 5V10a1 1 0 0 1 1-1z"
        fill="white"
      />
      {/* 체크 표시(보라) */}
      <path
        d="M16.5 18.5l2.8 2.8 4.7-5"
        stroke="#5E5BE0"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
