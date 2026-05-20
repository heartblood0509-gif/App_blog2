"use client";

// 기존 AuthGate의 모든 로직을 Provider로 흡수.
// - gateState !== "authorized"일 때는 자체 게이트 UI를 렌더하고 children은 숨김.
// - authorized 상태에서는 children을 그대로 렌더.
// - useAuthSession() 훅으로 session/supabase/deviceInfo/devices/refreshDevices를 노출.
//   /settings/devices 페이지가 이 훅을 사용해 등록 기기 목록을 그린다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  CheckCircle2,
  LogIn,
  LogOut,
  Monitor,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { AuthContextProvider } from "@/lib/auth/auth-context";
import type {
  AuthConfigResponse,
  DeviceAuthResponse,
  DeviceInfo,
  RegisteredDevice,
} from "@/lib/auth/types";

type GateState =
  | "loading"
  | "config-missing"
  | "signed-out"
  | "checking"
  | "authorized"
  | "pending"
  | "blocked"
  | "expired"
  | "device-limit"
  | "error";

interface AuthSessionContextValue {
  session: Session | null;
  supabase: SupabaseClient | null;
  deviceInfo: DeviceInfo | null;
  devices: RegisteredDevice[];
  refreshDevices: () => Promise<void>;
  gateState: GateState;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fallbackDeviceInfo(): DeviceInfo {
  const key = "app-blog-publisher-dev-device-id";
  let deviceId = window.localStorage.getItem(key);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(key, deviceId);
  }
  return {
    device_id: deviceId,
    device_name: "Browser Dev",
    platform: navigator.platform || "browser",
    app_version: "dev",
  };
}

async function readDeviceInfo(): Promise<DeviceInfo> {
  const deviceInfo = await window.electronAPI?.auth?.getDeviceInfo();
  return deviceInfo ?? fallbackDeviceInfo();
}

async function clearLocalAppSession(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [result, setResult] = useState<DeviceAuthResponse | null>(null);
  const [gateState, setGateState] = useState<GateState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isReplacing, setIsReplacing] = useState(false);

  const replacementBlockedUntil = result?.next_replacement_at
    ? new Date(result.next_replacement_at)
    : null;
  const canReplace =
    !replacementBlockedUntil ||
    Number.isNaN(replacementBlockedUntil.getTime()) ||
    replacementBlockedUntil.getTime() <= Date.now();

  const loadConfig = useCallback(async () => {
    setGateState("loading");
    setMessage(null);
    const [configRes, device] = await Promise.all([
      fetch("/api/auth/config").then((res) => res.json() as Promise<AuthConfigResponse>),
      readDeviceInfo(),
    ]);

    setConfig(configRes);
    setDeviceInfo(device);

    if (!configRes.auth_required) {
      setGateState("authorized");
      return;
    }
    if (!configRes.configured) {
      setGateState("config-missing");
      return;
    }

    const supabase = getSupabaseBrowserClient(configRes);
    setClient(supabase);
  }, []);

  const authorize = useCallback(
    async (activeSession: Session, activeDevice: DeviceInfo) => {
      setGateState("checking");
      setMessage(null);

      const response = await fetch("/api/auth/device/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeSession.access_token}`,
        },
        body: JSON.stringify(activeDevice),
      });
      const payload = (await response.json().catch(() => null)) as DeviceAuthResponse | null;
      if (!payload) {
        setGateState("error");
        setMessage("인증 서버 응답을 읽지 못했습니다.");
        return;
      }

      setResult(payload);
      if (payload.ok && payload.status === "authorized") {
        setGateState("authorized");
        return;
      }

      if (payload.status === "device_limit") {
        setGateState("device-limit");
        setSelectedDeviceId(payload.devices?.[0]?.device_id ?? "");
        return;
      }

      if (payload.status === "pending") {
        setGateState("pending");
        return;
      }
      if (payload.status === "blocked") {
        setGateState("blocked");
        return;
      }
      if (payload.status === "expired") {
        setGateState("expired");
        return;
      }

      setGateState("error");
      setMessage(payload.message ?? "사용 권한 확인에 실패했습니다.");
    },
    [],
  );

  const handleDeepLink = useCallback(
    async (url: string) => {
      if (!client || !deviceInfo) return;

      let code: string | null = null;
      try {
        code = new URL(url).searchParams.get("code");
      } catch {
        code = null;
      }
      if (!code) return;

      setGateState("checking");
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        setGateState("error");
        setMessage(error?.message ?? "Google 로그인 콜백 처리에 실패했습니다.");
        return;
      }

      setSession(data.session);
      await authorize(data.session, deviceInfo);
    },
    [authorize, client, deviceInfo],
  );

  useEffect(() => {
    loadConfig().catch((error) => {
      setGateState("error");
      setMessage(error instanceof Error ? error.message : "인증 설정을 불러오지 못했습니다.");
    });
  }, [loadConfig]);

  useEffect(() => {
    if (!client || !deviceInfo) return;

    let alive = true;
    client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) {
        authorize(data.session, deviceInfo).catch((error) => {
          setGateState("error");
          setMessage(error instanceof Error ? error.message : "사용 권한 확인에 실패했습니다.");
        });
      } else {
        setGateState("signed-out");
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setResult(null);
        setGateState("signed-out");
      }
    });

    const interval = window.setInterval(() => {
      client.auth.getSession().then(({ data }) => {
        if (data.session) authorize(data.session, deviceInfo).catch(() => {});
      });
    }, 5 * 60 * 1000);

    return () => {
      alive = false;
      subscription.unsubscribe();
      window.clearInterval(interval);
    };
  }, [authorize, client, deviceInfo]);

  useEffect(() => {
    if (!client || !deviceInfo) return;

    window.electronAPI?.auth?.getPendingDeepLink().then((url) => {
      if (url) handleDeepLink(url).catch(() => {});
    });
    return window.electronAPI?.auth?.onDeepLink((url) => {
      handleDeepLink(url).catch(() => {});
    });
  }, [client, deviceInfo, handleDeepLink]);

  const login = useCallback(async () => {
    if (!client || !config) return;

    setGateState("checking");
    setMessage(null);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: config.redirect_to,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error || !data.url) {
      setGateState("signed-out");
      setMessage(error?.message ?? "Google 로그인 URL을 만들지 못했습니다.");
      return;
    }

    if (window.electronAPI?.auth?.openExternal) {
      await window.electronAPI.auth.openExternal(data.url);
    } else {
      window.location.assign(data.url);
    }
    setGateState("signed-out");
  }, [client, config]);

  const logout = useCallback(async () => {
    await Promise.allSettled([client?.auth.signOut(), clearLocalAppSession()]);
    setSession(null);
    setResult(null);
    setGateState("signed-out");
  }, [client]);

  const retry = useCallback(() => {
    if (session && deviceInfo) {
      authorize(session, deviceInfo).catch((error) => {
        setGateState("error");
        setMessage(error instanceof Error ? error.message : "사용 권한 확인에 실패했습니다.");
      });
    } else {
      loadConfig().catch(() => {});
    }
  }, [authorize, deviceInfo, loadConfig, session]);

  const replaceDevice = useCallback(async () => {
    if (!session || !deviceInfo || !selectedDeviceId || !canReplace) return;
    setIsReplacing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/device/replace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          old_device_id: selectedDeviceId,
          device: deviceInfo,
        }),
      });
      const payload = (await response.json().catch(() => null)) as DeviceAuthResponse | null;
      if (!payload) {
        setGateState("error");
        setMessage("기기 교체 응답을 읽지 못했습니다.");
        return;
      }
      setResult(payload);
      if (payload.ok && payload.status === "authorized") {
        setGateState("authorized");
        return;
      }
      if (payload.status === "device_limit") {
        setGateState("device-limit");
        setSelectedDeviceId(payload.devices?.[0]?.device_id ?? "");
        return;
      }
      setGateState("error");
      setMessage(payload.message ?? "기기 교체에 실패했습니다.");
    } finally {
      setIsReplacing(false);
    }
  }, [canReplace, deviceInfo, selectedDeviceId, session]);

  const refreshDevices = useCallback(async () => {
    if (!session) return;
    const res = await fetch("/api/auth/device/list", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (!res.ok) {
      throw new Error(`기기 목록 요청 실패 (HTTP ${res.status})`);
    }
    const payload = (await res.json()) as DeviceAuthResponse;
    if (!payload.ok) {
      throw new Error(payload.message ?? "기기 목록을 불러오지 못했습니다.");
    }
    setResult((prev) => ({
      ok: payload.ok,
      status: payload.status,
      message: payload.message ?? prev?.message,
      user_email: payload.user_email ?? prev?.user_email ?? null,
      profile_status: payload.profile_status ?? prev?.profile_status ?? null,
      current_device_id: payload.current_device_id ?? prev?.current_device_id,
      devices: payload.devices ?? prev?.devices ?? [],
      next_replacement_at: payload.next_replacement_at ?? prev?.next_replacement_at ?? null,
    }));
  }, [session]);

  const statusTitle = useMemo(() => {
    if (gateState === "pending") return "구매 승인 대기 중";
    if (gateState === "blocked") return "계정 사용이 차단되었습니다";
    if (gateState === "expired") return "사용 기간이 만료되었습니다";
    if (gateState === "device-limit") return "등록 가능한 기기를 모두 사용 중입니다";
    return "사용 권한 확인 필요";
  }, [gateState]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      supabase: client,
      deviceInfo,
      devices: result?.devices ?? [],
      refreshDevices,
      gateState,
    }),
    [session, client, deviceInfo, result, refreshDevices, gateState],
  );

  if (gateState === "authorized") {
    return (
      <AuthSessionContext.Provider value={value}>
        <AuthContextProvider
          value={{
            role: result?.profile_role ?? null,
            email: session?.user.email ?? result?.user_email ?? null,
            accessToken: session?.access_token ?? null,
          }}
        >
          {children}
        </AuthContextProvider>
      </AuthSessionContext.Provider>
    );
  }

  return (
    <AuthSessionContext.Provider value={value}>
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 text-foreground">
        <Card className="w-full max-w-xl rounded-lg">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {gateState === "signed-out" ? (
                <ShieldCheck className="h-5 w-5" />
              ) : gateState === "device-limit" ? (
                <Monitor className="h-5 w-5" />
              ) : gateState === "pending" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <CardTitle>
              {gateState === "signed-out"
                ? "Google 계정으로 로그인"
                : gateState === "config-missing"
                  ? "Supabase 설정 필요"
                  : gateState === "loading" || gateState === "checking"
                    ? "로그인 상태 확인 중"
                    : statusTitle}
            </CardTitle>
            <CardDescription>
              {gateState === "signed-out"
                ? "결제 이메일과 같은 Google 계정으로 로그인해야 합니다."
                : gateState === "config-missing"
                  ? "Supabase 공개 설정을 확인한 뒤 앱을 다시 시작하세요."
                  : gateState === "loading" || gateState === "checking"
                    ? "계정과 등록 기기 정보를 확인하고 있습니다."
                    : result?.message ?? "관리자에게 구매 이메일을 알려 주세요."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {message}
              </div>
            )}

            {session?.user.email && gateState !== "signed-out" && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                로그인 계정: <span className="font-medium">{session.user.email}</span>
              </div>
            )}

            {gateState === "device-limit" && (
              <DeviceLimitPanel
                devices={result?.devices ?? []}
                selectedDeviceId={selectedDeviceId}
                onSelect={setSelectedDeviceId}
                canReplace={canReplace}
                nextReplacementAt={result?.next_replacement_at ?? null}
              />
            )}

            <div className="flex flex-wrap gap-2">
              {gateState === "signed-out" && (
                <Button onClick={login} className="gap-2">
                  <LogIn className="h-4 w-4" />
                  Google 로그인
                </Button>
              )}
              {gateState === "device-limit" && (
                <Button
                  onClick={replaceDevice}
                  disabled={!selectedDeviceId || !canReplace || isReplacing}
                  className="gap-2"
                >
                  <RefreshCcw className="h-4 w-4" />
                  선택한 기기 교체
                </Button>
              )}
              {(gateState === "error" || gateState === "config-missing") && (
                <Button onClick={retry} variant="outline" className="gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  다시 확인
                </Button>
              )}
              {session && gateState !== "checking" && (
                <Button onClick={logout} variant="outline" className="gap-2">
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return ctx;
}

function DeviceLimitPanel({
  devices,
  selectedDeviceId,
  onSelect,
  canReplace,
  nextReplacementAt,
}: {
  devices: RegisteredDevice[];
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
  canReplace: boolean;
  nextReplacementAt: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {devices.map((device) => (
          <label
            key={device.device_id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm hover:bg-muted/40"
          >
            <input
              type="radio"
              name="replace-device"
              className="mt-1"
              checked={selectedDeviceId === device.device_id}
              onChange={() => onSelect(device.device_id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{device.device_name}</span>
              <span className="block text-muted-foreground">{device.platform}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                마지막 확인: {formatDate(device.last_seen_at)}
              </span>
            </span>
          </label>
        ))}
      </div>
      {!canReplace && (
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          다음 기기 교체 가능일: {formatDate(nextReplacementAt)}
        </div>
      )}
    </div>
  );
}
