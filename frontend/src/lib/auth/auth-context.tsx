"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProfileRole } from "@/lib/auth/types";

interface AuthContextValue {
  role: ProfileRole | null;
  email: string | null;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  role: null,
  email: null,
  accessToken: null,
});

export function AuthContextProvider({
  value,
  children,
}: {
  value: AuthContextValue;
  children: ReactNode;
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
