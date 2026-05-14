This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Brand Profile Storage on Vercel

브랜드 블로그의 브랜드 프로필 CRUD는 Vercel 배포 환경에서 Python 로컬 백엔드 대신 Vercel KV/Upstash Redis REST API를 사용합니다.

Vercel 프로젝트에 Storage(KV/Upstash Redis)를 연결하고 다음 환경변수가 주입되어 있는지 확인하세요.

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

공개 URL을 운영용으로 사용할 경우 전체 앱에 Basic Auth를 거는 것을 권장합니다.

```bash
APP_BASIC_AUTH_USER=...
APP_BASIC_AUTH_PASSWORD=...
```

로컬/Electron 실행에서는 기존 Python 백엔드(`BACKEND_URL`, 기본 `http://localhost:8000`)를 계속 사용합니다.
