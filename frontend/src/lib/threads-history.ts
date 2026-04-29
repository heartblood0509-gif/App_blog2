export interface ThreadsHistoryItem {
  id: string;
  title: string;
  content: string;
  imageCount?: number;
  createdAt: string;
}

const STORAGE_KEY = "blogpick-threads-history";
const MAX_ITEMS = 50;

export function getHistory(): ThreadsHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? (JSON.parse(data) as ThreadsHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function addHistory(
  item: Omit<ThreadsHistoryItem, "id" | "createdAt">
): string {
  if (typeof window === "undefined") return "";
  const history = getHistory();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  history.unshift({
    ...item,
    id,
    createdAt: new Date().toISOString(),
  });
  if (history.length > MAX_ITEMS) history.pop();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  return id;
}

export function updateHistory(
  id: string,
  updates: Partial<Pick<ThreadsHistoryItem, "imageCount">>
): void {
  if (typeof window === "undefined") return;
  const history = getHistory();
  const idx = history.findIndex((item) => item.id === id);
  if (idx === -1) return;
  Object.assign(history[idx], updates);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function deleteHistory(id: string): void {
  if (typeof window === "undefined") return;
  const filtered = getHistory().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
