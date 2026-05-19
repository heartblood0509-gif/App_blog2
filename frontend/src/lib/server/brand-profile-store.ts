import type { BrandProfile } from "@/types/brand";

const BRAND_PROFILES_KEY = "app_blog2:brand_profiles";

type BrandProfilePayload = Omit<BrandProfile, "id">;

interface KvResponse<T> {
  result?: T;
  error?: string;
}

export function hasBrandProfileKvStore(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "Vercel KV 설정이 필요합니다. KV_REST_API_URL, KV_REST_API_TOKEN 환경변수를 설정해주세요.",
    );
  }
  return { url, token };
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const { url, token } = kvConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as KvResponse<T>;
  if (!res.ok || data.error) {
    throw new Error(data.error || `Vercel KV 요청 실패 (${res.status})`);
  }
  return data.result as T;
}

function normalizeProfiles(raw: unknown): BrandProfile[] {
  if (raw === null || raw === undefined || raw === "") return [];

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    parsed = JSON.parse(raw);
  }

  return Array.isArray(parsed) ? (parsed as BrandProfile[]) : [];
}

async function readProfiles(): Promise<BrandProfile[]> {
  const raw = await kvCommand<string | null>(["GET", BRAND_PROFILES_KEY]);
  return normalizeProfiles(raw);
}

async function writeProfiles(profiles: BrandProfile[]): Promise<void> {
  await kvCommand<string>(["SET", BRAND_PROFILES_KEY, JSON.stringify(profiles)]);
}

function validatePayload(payload: BrandProfilePayload): string | null {
  if (!payload || typeof payload !== "object") return "브랜드 프로필 정보가 필요합니다.";
  if (!payload.name?.trim()) return "브랜드명을 입력해주세요.";
  return null;
}

function nextProfileId(profiles: BrandProfile[]): string {
  const existingIds = new Set(profiles.map((profile) => profile.id));
  let idx = 1;
  while (existingIds.has(`brand${idx}`)) idx += 1;
  return `brand${idx}`;
}

export async function listBrandProfilesFromKv(): Promise<BrandProfile[]> {
  return readProfiles();
}

export async function createBrandProfileInKv(
  payload: BrandProfilePayload,
): Promise<BrandProfile> {
  const validationError = validatePayload(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const profiles = await readProfiles();
  if (profiles.some((profile) => profile.name === payload.name)) {
    throw new Error(`이미 등록된 브랜드명입니다: ${payload.name}`);
  }

  const profile: BrandProfile = {
    id: nextProfileId(profiles),
    ...payload,
  };
  await writeProfiles([...profiles, profile]);
  return profile;
}

export async function updateBrandProfileInKv(
  profileId: string,
  payload: BrandProfilePayload,
): Promise<BrandProfile> {
  const validationError = validatePayload(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const profiles = await readProfiles();
  const index = profiles.findIndex((profile) => profile.id === profileId);
  if (index === -1) {
    throw new Error("해당 브랜드 프로필을 찾을 수 없습니다.");
  }

  const duplicate = profiles.some(
    (profile) => profile.id !== profileId && profile.name === payload.name,
  );
  if (duplicate) {
    throw new Error(`이미 등록된 브랜드명입니다: ${payload.name}`);
  }

  const updated: BrandProfile = { id: profileId, ...payload };
  const next = [...profiles];
  next[index] = updated;
  await writeProfiles(next);
  return updated;
}

export async function deleteBrandProfileFromKv(profileId: string): Promise<void> {
  const profiles = await readProfiles();
  const next = profiles.filter((profile) => profile.id !== profileId);
  if (next.length === profiles.length) {
    throw new Error("해당 브랜드 프로필을 찾을 수 없습니다.");
  }
  await writeProfiles(next);
}
