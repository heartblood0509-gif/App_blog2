"use client";

import { useCallback, useEffect, useState } from "react";

export type WhatsNewItemType = "new" | "improve" | "fix";

export interface WhatsNewItem {
  type: WhatsNewItemType;
  text: string;
}

export interface WhatsNewEntry {
  version: string;
  date: string;
  title: string;
  items: WhatsNewItem[];
}

interface WhatsNewData {
  entries: WhatsNewEntry[];
}

const LS_KEY = "whats-new:last-seen-version";
const DATA_URL = "/whats-new.json";

let cachedData: WhatsNewData | null = null;
let inflightFetch: Promise<WhatsNewData | null> | null = null;

async function loadWhatsNew(): Promise<WhatsNewData | null> {
  if (cachedData) return cachedData;
  if (inflightFetch) return inflightFetch;
  inflightFetch = fetch(DATA_URL, { cache: "no-cache" })
    .then((res) => (res.ok ? (res.json() as Promise<WhatsNewData>) : null))
    .then((data) => {
      cachedData = data;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflightFetch = null;
    });
  return inflightFetch;
}

export function useWhatsNew() {
  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadWhatsNew().then((data) => {
      if (cancelled) return;
      setEntries(data?.entries ?? []);
      try {
        setLastSeen(localStorage.getItem(LS_KEY));
      } catch {
        setLastSeen(null);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const latestVersion = entries[0]?.version ?? null;
  const hasUnseen =
    loaded && latestVersion !== null && latestVersion !== lastSeen;

  const markAllSeen = useCallback(() => {
    if (!latestVersion) return;
    try {
      localStorage.setItem(LS_KEY, latestVersion);
    } catch {
      // localStorage 접근 불가(SSR/시크릿 모드) — 무시
    }
    setLastSeen(latestVersion);
  }, [latestVersion]);

  return {
    entries,
    latestVersion,
    hasUnseen,
    loaded,
    markAllSeen,
  };
}
