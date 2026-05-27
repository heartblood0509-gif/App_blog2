"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Package, Download, Upload, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { BrandProfile } from "@/types/brand";
import type { AeoProfile } from "@/types/aeo";
import type { UserProduct } from "@/types";

const BUNDLE_VERSION = 1;
const APP_NAME = "app_blog2";

interface ProfileBundleDialogProps {
  open: boolean;
  onClose: () => void;
  /** 가져오기 성공 후 부모가 목록 새로고침 시 호출 (null = no-op) */
  onImported?: () => void;
}

type Kind = "brand" | "aeo" | "product";

interface Bundle {
  version: number;
  exportedAt: string;
  appName: string;
  profiles: {
    brand: BrandProfile[];
    aeo: AeoProfile[];
    product: UserProduct[];
  };
}

interface PreviewRow {
  kind: Kind;
  /** unique key 값 (브랜드/제품=name, AEO=label) */
  key: string;
  /** 사용자가 인지하는 표시명 */
  displayName: string;
  status: "new" | "duplicate" | "error";
  errorReason?: string;
}

const KIND_LABEL: Record<Kind, string> = {
  brand: "브랜드 프로필",
  aeo: "AEO 프로필",
  product: "제품 프로필",
};

function uniqueKeyFor(kind: Kind): "name" | "label" {
  return kind === "aeo" ? "label" : "name";
}

function displayKeyFor(kind: Kind): "name" {
  // 세 종류 모두 표시명은 name 필드 (AEO도 화면엔 name을 노출)
  return "name";
}

export function ProfileBundleDialog({ open, onClose, onImported }: ProfileBundleDialogProps) {
  const [tab, setTab] = useState<"export" | "import">("export");

  // ── 내보내기 상태 ──
  const [brandList, setBrandList] = useState<BrandProfile[]>([]);
  const [aeoList, setAeoList] = useState<AeoProfile[]>([]);
  const [productList, setProductList] = useState<UserProduct[]>([]);
  const [exportSelected, setExportSelected] = useState<{
    brand: Set<string>;
    aeo: Set<string>;
    product: Set<string>;
  }>({ brand: new Set(), aeo: new Set(), product: new Set() });
  const [loadingLists, setLoadingLists] = useState(false);

  // ── 가져오기 상태 ──
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importChecked, setImportChecked] = useState<Set<string>>(new Set()); // key="kind:keyValue"
  const [conflictPolicy, setConflictPolicy] = useState<"overwrite" | "skip">("skip");
  const [importing, setImporting] = useState(false);

  // 현재 등록된 unique key set (가져오기 미리보기에서 중복 판정용)
  const existingKeys = useMemo(() => ({
    brand: new Set(brandList.map((b) => b.name)),
    aeo: new Set(aeoList.map((a) => a.label)),
    product: new Set(productList.map((p) => p.name)),
  }), [brandList, aeoList, productList]);

  // 다이얼로그 열릴 때마다 현재 목록 fetch
  useEffect(() => {
    if (!open) return;
    setLoadingLists(true);
    Promise.allSettled([
      fetch("/api/brand/profiles", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/aeo/profiles", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/products", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([b, a, p]) => {
        setBrandList(b.status === "fulfilled" && Array.isArray(b.value) ? b.value : []);
        setAeoList(a.status === "fulfilled" && Array.isArray(a.value) ? a.value : []);
        setProductList(p.status === "fulfilled" && Array.isArray(p.value) ? p.value : []);
      })
      .finally(() => setLoadingLists(false));
  }, [open]);

  // 다이얼로그 닫힐 때 상태 초기화
  useEffect(() => {
    if (open) return;
    setBundle(null);
    setPreviewRows([]);
    setImportChecked(new Set());
    setConflictPolicy("skip");
    setExportSelected({ brand: new Set(), aeo: new Set(), product: new Set() });
    setTab("export");
  }, [open]);

  // ── 내보내기 토글 핸들러 ──
  const toggleExport = useCallback((kind: Kind, key: string) => {
    setExportSelected((prev) => {
      const next = { ...prev, [kind]: new Set(prev[kind]) };
      if (next[kind].has(key)) next[kind].delete(key);
      else next[kind].add(key);
      return next;
    });
  }, []);

  const setAllExport = useCallback((kind: Kind, all: boolean) => {
    setExportSelected((prev) => {
      const next = { ...prev, [kind]: new Set<string>() };
      if (all) {
        if (kind === "brand") brandList.forEach((b) => next.brand.add(b.name));
        if (kind === "aeo") aeoList.forEach((a) => next.aeo.add(a.label));
        if (kind === "product") productList.forEach((p) => next.product.add(p.name));
      }
      return next;
    });
  }, [brandList, aeoList, productList]);

  const setAllExportAcrossAll = useCallback((all: boolean) => {
    if (all) {
      setExportSelected({
        brand: new Set(brandList.map((b) => b.name)),
        aeo: new Set(aeoList.map((a) => a.label)),
        product: new Set(productList.map((p) => p.name)),
      });
    } else {
      setExportSelected({ brand: new Set(), aeo: new Set(), product: new Set() });
    }
  }, [brandList, aeoList, productList]);

  const exportTotal =
    exportSelected.brand.size + exportSelected.aeo.size + exportSelected.product.size;

  const handleExport = useCallback(() => {
    if (exportTotal === 0) {
      toast.error("내보낼 항목을 선택해주세요.");
      return;
    }
    const bundleOut: Bundle = {
      version: BUNDLE_VERSION,
      exportedAt: new Date().toISOString(),
      appName: APP_NAME,
      profiles: {
        brand: brandList.filter((b) => exportSelected.brand.has(b.name)),
        aeo: aeoList.filter((a) => exportSelected.aeo.has(a.label)),
        product: productList.filter((p) => exportSelected.product.has(p.name)),
      },
    };
    const json = JSON.stringify(bundleOut, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `app_blog_프로필_${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${exportTotal}개 항목을 내보냈습니다.`);
  }, [brandList, aeoList, productList, exportSelected, exportTotal]);

  // ── 가져오기 파일 선택 핸들러 (사전 검증) ──
  const handleFile = useCallback(async (file: File) => {
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.error("JSON 파일이 아니거나 깨진 파일입니다.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      toast.error("올바른 프로필 번들이 아닙니다.");
      return;
    }
    const candidate = parsed as Partial<Bundle>;
    if (candidate.version !== BUNDLE_VERSION) {
      toast.error(
        `지원하지 않는 파일 버전입니다. (지원: v${BUNDLE_VERSION}, 파일: v${candidate.version ?? "?"})`,
      );
      return;
    }
    if (typeof candidate.profiles !== "object" || candidate.profiles === null) {
      toast.error("파일 구조가 올바르지 않습니다. (profiles 누락)");
      return;
    }
    const p = candidate.profiles as Bundle["profiles"];
    if (!Array.isArray(p.brand) || !Array.isArray(p.aeo) || !Array.isArray(p.product)) {
      toast.error("파일 구조가 올바르지 않습니다. (profiles 배열 누락)");
      return;
    }

    // 미리보기 행 생성 + 사전 검증
    const rows: PreviewRow[] = [];
    const initialChecked = new Set<string>();

    const validateItem = (kind: Kind, item: unknown): PreviewRow | null => {
      if (typeof item !== "object" || item === null) {
        return { kind, key: "?", displayName: "(잘못된 항목)", status: "error", errorReason: "객체가 아님" };
      }
      const rec = item as Record<string, unknown>;
      const uk = uniqueKeyFor(kind);
      const dk = displayKeyFor(kind);
      const keyVal = rec[uk];
      const dispVal = rec[dk];
      if (typeof keyVal !== "string" || !keyVal) {
        return { kind, key: "?", displayName: "(이름 없음)", status: "error", errorReason: `${uk} 필드 없음` };
      }
      const display = typeof dispVal === "string" && dispVal ? dispVal : keyVal;

      // 추가 필수 필드 사전 체크 (Pydantic이 잡지만, UI에서 미리 노출)
      if (kind === "product") {
        const cat = rec["category"];
        if (typeof cat !== "string" || !cat) {
          return { kind, key: keyVal, displayName: display, status: "error", errorReason: "category 누락" };
        }
      }

      const isDup = existingKeys[kind].has(keyVal);
      return {
        kind,
        key: keyVal,
        displayName: display,
        status: isDup ? "duplicate" : "new",
      };
    };

    // 번들 내부 자체 중복 검사 (UI에서도 미리)
    const seenPerKind: Record<Kind, Set<string>> = { brand: new Set(), aeo: new Set(), product: new Set() };
    const selfDupes: string[] = [];

    (["brand", "aeo", "product"] as const).forEach((kind) => {
      const items = p[kind] as unknown[];
      const uk = uniqueKeyFor(kind);
      items.forEach((item) => {
        const row = validateItem(kind, item);
        if (!row) return;
        if (row.status !== "error") {
          if (seenPerKind[kind].has(row.key)) {
            selfDupes.push(`${KIND_LABEL[kind]} "${row.displayName}"`);
            row.status = "error";
            row.errorReason = `파일 내부 ${uk} 중복`;
          } else {
            seenPerKind[kind].add(row.key);
          }
        }
        rows.push(row);
        if (row.status !== "error") {
          initialChecked.add(`${kind}:${row.key}`);
        }
      });
    });

    if (selfDupes.length > 0) {
      toast.error(`파일 내부에 중복된 항목이 있습니다: ${selfDupes.join(", ")}`);
      // 그래도 미리보기는 보여줌(오류 표기). 가져오기 버튼은 동작 가능하지만 서버가 거부함.
    }

    setBundle(candidate as Bundle);
    setPreviewRows(rows);
    setImportChecked(initialChecked);
  }, [existingKeys]);

  const toggleImport = useCallback((key: string) => {
    setImportChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const importCheckedCount = importChecked.size;

  const handleImport = useCallback(async () => {
    if (!bundle) return;
    if (importCheckedCount === 0) {
      toast.error("가져올 항목을 선택해주세요.");
      return;
    }

    const selection = { brand: [] as string[], aeo: [] as string[], product: [] as string[] };
    importChecked.forEach((composite) => {
      const idx = composite.indexOf(":");
      if (idx <= 0) return;
      const kind = composite.slice(0, idx) as Kind;
      const key = composite.slice(idx + 1);
      selection[kind].push(key);
    });

    setImporting(true);
    try {
      const res = await fetch("/api/profile-bundle/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle, selection, conflictPolicy }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "가져오기에 실패했습니다.");
      }

      const parts: string[] = [];
      (["brand", "aeo", "product"] as const).forEach((kind) => {
        const r = data[kind];
        if (!r) return;
        const sub: string[] = [];
        if (r.added > 0) sub.push(`${r.added}개 추가`);
        if (r.overwritten > 0) sub.push(`${r.overwritten}개 덮어쓰기`);
        if (r.skipped > 0) sub.push(`${r.skipped}개 건너뜀`);
        if (sub.length > 0) parts.push(`${KIND_LABEL[kind]}: ${sub.join(", ")}`);
      });

      toast.success(parts.length > 0 ? parts.join(" / ") : "변경 사항 없음");

      const allErrors: string[] = [];
      (["brand", "aeo", "product"] as const).forEach((kind) => {
        const errs: string[] = data[kind]?.errors ?? [];
        errs.forEach((e) => allErrors.push(`[${KIND_LABEL[kind]}] ${e}`));
      });
      if (allErrors.length > 0) {
        toast.warning(`일부 항목은 가져오지 못했습니다:\n${allErrors.join("\n")}`, {
          duration: 10000,
        });
      }

      if (data.backupPath) {
        toast.info(`백업 위치: ${data.backupPath}`, { duration: 10000 });
      }

      onImported?.();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "가져오기에 실패했습니다.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }, [bundle, importChecked, importCheckedCount, conflictPolicy, onImported, onClose]);

  // ── 렌더 헬퍼 ──
  const renderExportGroup = (kind: Kind, items: Array<{ key: string; name: string; category?: string }>) => {
    const selected = exportSelected[kind];
    return (
      <div key={kind} className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {KIND_LABEL[kind]} ({items.length}개)
          </h3>
          {items.length > 0 && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAllExport(kind, true)}>
                전체 선택
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAllExport(kind, false)}>
                선택 해제
              </Button>
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground pl-1">등록된 항목이 없습니다.</p>
        ) : (
          <div className="space-y-1">
            {items.map((it) => (
              <label
                key={it.key}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selected.has(it.key)}
                  onCheckedChange={() => toggleExport(kind, it.key)}
                />
                <span className="text-sm">{it.name}</span>
                {it.category && (
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {it.category}
                  </Badge>
                )}
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  const groupedPreview = useMemo(() => {
    const out: Record<Kind, PreviewRow[]> = { brand: [], aeo: [], product: [] };
    previewRows.forEach((r) => out[r.kind].push(r));
    return out;
  }, [previewRows]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            프로필 가져오기 / 내보내기
          </DialogTitle>
          <DialogDescription>
            브랜드 / AEO / 제품 프로필을 파일로 묶어 다른 PC로 옮기거나 백업할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "export" | "import")} className="flex-1 overflow-hidden">
          <TabsList>
            <TabsTrigger value="export" className="gap-1">
              <Download className="h-4 w-4" />내보내기
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-1">
              <Upload className="h-4 w-4" />가져오기
            </TabsTrigger>
          </TabsList>

          {/* ── 내보내기 탭 ── */}
          <TabsContent value="export" className="flex-1 overflow-y-auto space-y-4 mt-2 pr-1">
            {loadingLists ? (
              <p className="text-sm text-muted-foreground">불러오는 중...</p>
            ) : (
              <>
                <div className="flex items-center justify-between border-b pb-2">
                  <span className="text-xs text-muted-foreground">전체 종류에 일괄 적용:</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAllExportAcrossAll(true)}>
                      전부 선택
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAllExportAcrossAll(false)}>
                      전부 해제
                    </Button>
                  </div>
                </div>

                {renderExportGroup(
                  "brand",
                  brandList.map((b) => ({ key: b.name, name: b.name, category: b.category })),
                )}
                {renderExportGroup(
                  "aeo",
                  aeoList.map((a) => ({ key: a.label, name: a.name, category: a.category })),
                )}
                {renderExportGroup(
                  "product",
                  productList.map((p) => ({ key: p.name, name: p.name, category: p.category })),
                )}
              </>
            )}
          </TabsContent>

          {/* ── 가져오기 탭 ── */}
          <TabsContent value="import" className="flex-1 overflow-y-auto space-y-4 mt-2 pr-1">
            <div>
              <label className="block">
                <span className="text-sm font-medium">JSON 파일 선택</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="mt-1 block w-full text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1 file:text-sm hover:file:bg-muted cursor-pointer"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </label>
            </div>

            {bundle && (
              <>
                <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                  내보낸 시각: {bundle.exportedAt ?? "(미상)"}
                </div>

                {(["brand", "aeo", "product"] as const).map((kind) => {
                  const rows = groupedPreview[kind];
                  if (rows.length === 0) return null;
                  return (
                    <div key={kind} className="space-y-2">
                      <h3 className="text-sm font-semibold">
                        {KIND_LABEL[kind]} ({rows.length}개)
                      </h3>
                      <div className="space-y-1">
                        {rows.map((r) => {
                          const composite = `${r.kind}:${r.key}`;
                          const checked = importChecked.has(composite);
                          const isError = r.status === "error";
                          return (
                            <label
                              key={composite}
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                                isError ? "opacity-60" : "hover:bg-muted/50 cursor-pointer"
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                disabled={isError}
                                onCheckedChange={() => !isError && toggleImport(composite)}
                              />
                              <span className="text-sm">{r.displayName}</span>
                              {r.status === "new" && (
                                <Badge variant="secondary" className="text-[10px] ml-auto">
                                  신규
                                </Badge>
                              )}
                              {r.status === "duplicate" && (
                                <Badge variant="outline" className="text-[10px] ml-auto border-amber-500 text-amber-700">
                                  중복
                                </Badge>
                              )}
                              {r.status === "error" && (
                                <Badge variant="destructive" className="text-[10px] ml-auto gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  오류 — {r.errorReason}
                                </Badge>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="border-t pt-3 space-y-2">
                  <span className="text-sm font-medium">중복 항목 처리</span>
                  <div className="flex gap-3 text-sm">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictPolicy"
                        value="skip"
                        checked={conflictPolicy === "skip"}
                        onChange={() => setConflictPolicy("skip")}
                      />
                      건너뛰기 (안전)
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictPolicy"
                        value="overwrite"
                        checked={conflictPolicy === "overwrite"}
                        onChange={() => setConflictPolicy("overwrite")}
                      />
                      덮어쓰기
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    가져오기 직전에 현재 데이터를 자동으로 백업합니다.
                  </p>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
          {tab === "export" ? (
            <Button onClick={handleExport} disabled={exportTotal === 0} className="gap-1">
              <Download className="h-4 w-4" />
              내보내기 ({exportTotal}개)
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={importCheckedCount === 0 || importing} className="gap-1">
              <Upload className="h-4 w-4" />
              {importing ? "가져오는 중..." : `가져오기 (${importCheckedCount}개)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
