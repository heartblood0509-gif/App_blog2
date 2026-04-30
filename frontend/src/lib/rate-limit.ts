const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

declare global {
  var __threadsRateLimitInterval: NodeJS.Timeout | undefined;
}

if (!globalThis.__threadsRateLimitInterval) {
  globalThis.__threadsRateLimitInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 60_000);
}

export function rateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60_000
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: maxRequests - 1 };
  }

  if (entry.count >= maxRequests) {
    return { success: false, remaining: 0 };
  }

  entry.count++;
  return { success: true, remaining: maxRequests - entry.count };
}

export function getClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

export function rateLimitResponse() {
  return Response.json(
    { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    { status: 429 }
  );
}
