"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  coerceNutrition,
  formatFoodsSummary,
  type NutritionJson,
} from "@/lib/mealNutrition";

type MealLog = {
  id: number;
  rawInput: string;
  /** Prisma Json として返るため unknown */
  result: unknown;
  createdAt: string;
};

type RowDraft = {
  rawInput: string;
  foodsLine: string;
  kcal: string;
  p: string;
  f: string;
  c: string;
};

const inputClass =
  "w-full min-w-[3.5rem] rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";

function logToDraft(log: MealLog): RowDraft {
  const n = coerceNutrition(log.result);
  return {
    rawInput: log.rawInput,
    foodsLine: formatFoodsSummary(n),
    kcal: String(n.total.kcal),
    p: String(n.total.p),
    f: String(n.total.f),
    c: String(n.total.c),
  };
}

function parseDraftTotal(d: RowDraft): { kcal: number; p: number; f: number; c: number } | null {
  const kcal = Number(d.kcal);
  const p = Number(d.p);
  const f = Number(d.f);
  const c = Number(d.c);
  if (![kcal, p, f, c].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return { kcal, p, f, c };
}

export default function Home() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const refreshLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/memo", { cache: "no-store" });
      const data = (await res.json()) as { logs?: MealLog[]; error?: string };

      if (res.ok && Array.isArray(data.logs)) {
        setLogs(data.logs);
        setDbError(null);
        return;
      }

      setDbError(
        typeof data.error === "string"
          ? data.error
          : "記録一覧を読み込めませんでした。"
      );
      if (Array.isArray(data.logs)) setLogs(data.logs);
    } catch {
      setDbError("記録一覧の通信に失敗しました。");
    }
  }, []);

  useEffect(() => {
    void refreshLogs();
  }, [refreshLogs]);

  useEffect(() => {
    const ids = new Set(logs.map((l) => l.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setEditing((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setDrafts((prev) => {
      const next: Record<number, RowDraft> = {};
      for (const [idStr, d] of Object.entries(prev)) {
        const id = Number(idStr);
        if (ids.has(id)) next[id] = d;
      }
      if (Object.keys(next).length === Object.keys(prev).length) return prev;
      return next;
    });
  }, [logs]);

  const allIds = logs.map((l) => l.id);
  const allSelected = logs.length > 0 && selected.size === logs.length;
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const clearSelection = () => setSelected(new Set());

  const startEditFromSelection = () => {
    if (selected.size === 0) {
      setActionNotice("編集する行をチェックで選んでください。");
      return;
    }
    setActionNotice(null);
    setEditing((prev) => {
      const next = new Set(prev);
      for (const id of selected) next.add(id);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of selected) {
        const log = logs.find((l) => l.id === id);
        if (log) next[id] = logToDraft(log);
      }
      return next;
    });
  };

  const cancelRowEdit = (id: number) => {
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const cancelAllEdits = () => {
    setEditing(new Set());
    setDrafts({});
    setActionNotice(null);
  };

  const onBulkDelete = async () => {
    if (selected.size === 0) {
      setActionNotice("削除する行をチェックで選んでください。");
      return;
    }
    if (
      !confirm(
        `選択中の ${selected.size} 件をデータベースから削除しますか？\nこの操作は取り消せません。`
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setActionNotice(null);
    try {
      const res = await fetch("/api/memo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = (await res.json()) as { error?: string; deleted?: number };

      if (!res.ok) {
        setActionNotice(
          typeof data.error === "string" ? data.error : "削除に失敗しました。"
        );
        return;
      }

      const n = typeof data.deleted === "number" ? data.deleted : 0;
      setActionNotice(`${n} 件を削除しました。`);
      clearSelection();
      await refreshLogs();
    } catch {
      setActionNotice("削除の通信に失敗しました。");
    } finally {
      setIsDeleting(false);
    }
  };

  const onSaveEdits = async () => {
    if (editing.size === 0) {
      setActionNotice("編集中の行がありません。「更新」でチェックした行を編集モードにしてください。");
      return;
    }

    const items: Array<{
      id: number;
      rawInput: string;
      foodsLine: string;
      total: { kcal: number; p: number; f: number; c: number };
    }> = [];

    for (const id of editing) {
      const d = drafts[id];
      if (!d) {
        setActionNotice(`行 id=${id} の編集データがありません。`);
        return;
      }
      const total = parseDraftTotal(d);
      if (!total) {
        setActionNotice(
          `行 id=${id}: カロリー・P・F・C は 0 以上の数値にしてください（現在の入力を確認してください）。`
        );
        return;
      }
      items.push({
        id,
        rawInput: d.rawInput,
        foodsLine: d.foodsLine,
        total,
      });
    }

    setIsSaving(true);
    setActionNotice(null);
    try {
      const res = await fetch("/api/memo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json()) as { error?: string; updated?: number };

      if (!res.ok) {
        setActionNotice(
          typeof data.error === "string" ? data.error : "更新に失敗しました。"
        );
        return;
      }

      const n = typeof data.updated === "number" ? data.updated : items.length;
      setActionNotice(`${n} 件を更新しました。`);
      setEditing(new Set());
      setDrafts({});
      await refreshLogs();
    } catch {
      setActionNotice("更新の通信に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setIsLoading(true);
    setReply("");
    setSaveHint(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (response.ok) {
        const json = data.json as NutritionJson;
        setReply(JSON.stringify(json, null, 2));

        const memoRes = await fetch("/api/memo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawInput: message, result: json }),
        });
        const memoData = (await memoRes.json()) as { error?: string };
        if (!memoRes.ok) {
          setSaveHint(null);
          setDbError(
            typeof memoData.error === "string"
              ? memoData.error
              : "DBへの保存に失敗しました。"
          );
        } else {
          setDbError(null);
          setSaveHint("記録テーブルに保存しました。");
        }

        await refreshLogs();
      } else {
        const detail =
          typeof data.details === "string" && data.details
            ? `\n\n（詳細）\n${data.details}`
            : "";
        const raw =
          typeof data.raw === "string" && data.raw ? `\n\n（raw）\n${data.raw}` : "";
        setReply(`エラー: ${data.error}${detail}${raw}`);
      }
    } catch {
      setReply("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            Calreco
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            Gemini 2.5 Flash に食事内容を投げて、カロリー/PFCの推定を返します。
          </p>
        </div>

        {dbError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {dbError}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>AI 食事記録</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              placeholder="例: さば味噌定食（ご飯大盛り）を食べました。カロリーとPFCを推定して。"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button onClick={handleSubmit} disabled={isLoading || !message.trim()}>
                {isLoading ? "送信中..." : "送信"}
              </Button>
              <span className="text-xs text-neutral-500">
                API: <code className="rounded bg-neutral-100 px-1 py-0.5">/api/chat</code>
              </span>
            </div>

            {reply && (
              <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                <h3 className="text-sm font-semibold text-neutral-900">AIの回答</h3>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
                  {reply}
                </pre>
                {saveHint ? (
                  <p className="mt-2 text-sm font-medium text-emerald-700">{saveHint}</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>記録（最新30件）</CardTitle>
              <Button variant="secondary" onClick={refreshLogs} disabled={isLoading}>
                再読み込み
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-neutral-600">
                  選択: <strong>{selected.size}</strong> 件
                  {editing.size > 0 ? (
                    <>
                      {" "}
                      · 編集中: <strong>{editing.size}</strong> 行
                    </>
                  ) : null}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selected.size === 0}
                >
                  選択を解除
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={startEditFromSelection}
                  disabled={selected.size === 0}
                >
                  更新（編集モード）
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void onBulkDelete()}
                  disabled={selected.size === 0 || isDeleting}
                >
                  {isDeleting ? "削除中…" : "削除（一括）"}
                </Button>
              </div>
              {editing.size > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-neutral-200 pt-3">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void onSaveEdits()}
                    disabled={isSaving}
                  >
                    {isSaving ? "保存中…" : "変更を保存"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelAllEdits}
                    disabled={isSaving}
                  >
                    編集をすべてキャンセル
                  </Button>
                </div>
              ) : null}
              {actionNotice ? (
                <p className="text-sm text-neutral-700">{actionNotice}</p>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[56rem] w-full border-collapse overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <thead className="bg-neutral-900 text-white">
                  <tr>
                    <th className="w-10 px-2 py-3 text-center text-sm font-medium">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-400"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={!logs.length}
                        title="すべて選択"
                        aria-label="すべて選択"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium whitespace-nowrap">
                      日時
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium min-w-[10rem]">
                      内容
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium min-w-[8rem]">
                      内訳（食品）
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">
                      カロリー
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">
                      P
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">
                      F
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium whitespace-nowrap">
                      C
                    </th>
                    <th className="w-24 px-2 py-3 text-center text-sm font-medium">
                      行
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const n = coerceNutrition(log.result);
                    const isEditing = editing.has(log.id);
                    const draft = drafts[log.id];

                    return (
                      <tr
                        key={log.id}
                        className={cn(
                          "even:bg-neutral-50 hover:bg-neutral-100",
                          isEditing && "bg-amber-50/60 hover:bg-amber-50/80"
                        )}
                      >
                        <td className="border-b border-neutral-200 px-2 py-2 text-center align-top">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-neutral-400"
                            checked={selected.has(log.id)}
                            onChange={() => toggleSelect(log.id)}
                            aria-label={`行 ${log.id} を選択`}
                          />
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-left text-sm whitespace-nowrap align-top">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-left align-top max-w-[14rem]">
                          {isEditing && draft ? (
                            <Textarea
                              rows={3}
                              className="text-sm"
                              value={draft.rawInput}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [log.id]: { ...prev[log.id]!, rawInput: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span className="line-clamp-3 text-sm">{log.rawInput}</span>
                          )}
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-left align-top max-w-[12rem]">
                          {isEditing && draft ? (
                            <Textarea
                              rows={3}
                              className="text-sm"
                              value={draft.foodsLine}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [log.id]: { ...prev[log.id]!, foodsLine: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span className="line-clamp-3 text-sm text-neutral-700">
                              {formatFoodsSummary(n)}
                            </span>
                          )}
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-right align-top">
                          {isEditing && draft ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              className={cn(inputClass, "text-right")}
                              value={draft.kcal}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [log.id]: { ...prev[log.id]!, kcal: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span className="text-sm">{n.total.kcal} kcal</span>
                          )}
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-right align-top">
                          {isEditing && draft ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              className={cn(inputClass, "text-right")}
                              value={draft.p}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [log.id]: { ...prev[log.id]!, p: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span className="text-sm">{n.total.p} g</span>
                          )}
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-right align-top">
                          {isEditing && draft ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              className={cn(inputClass, "text-right")}
                              value={draft.f}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [log.id]: { ...prev[log.id]!, f: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span className="text-sm">{n.total.f} g</span>
                          )}
                        </td>
                        <td className="border-b border-neutral-200 px-4 py-2 text-right align-top">
                          {isEditing && draft ? (
                            <input
                              type="number"
                              inputMode="decimal"
                              className={cn(inputClass, "text-right")}
                              value={draft.c}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [log.id]: { ...prev[log.id]!, c: e.target.value },
                                }))
                              }
                            />
                          ) : (
                            <span className="text-sm">{n.total.c} g</span>
                          )}
                        </td>
                        <td className="border-b border-neutral-200 px-2 py-2 text-center align-top">
                          {isEditing ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => cancelRowEdit(log.id)}
                            >
                              取消
                            </Button>
                          ) : (
                            <span className="text-xs text-neutral-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!logs.length && (
                    <tr>
                      <td
                        colSpan={9}
                        className="border-b border-neutral-200 px-6 py-6 text-left text-sm text-neutral-500"
                      >
                        {dbError
                          ? "上記の手順でDBを起動・マイグレーションすると、ここに記録が表示されます。"
                          : "まだ記録がありません。上のフォームから送信すると自動で保存されます。"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
