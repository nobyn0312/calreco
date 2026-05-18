"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  coerceNutrition,
  formatFoodsSummary,
  formatFoodItemLine,
  buildPatchedMealResult,
  type NutritionJson,
} from "@/lib/mealNutrition";
import {
  type ChatTurn,
  formatAssistantTurnForHistory,
  displayAssistantHistoryContent,
} from "@/lib/chatHistory";

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

type PendingRecord = {
  assistantMessage: string;
  baseNutrition: NutritionJson;
  draft: RowDraft;
};

export default function Home() {
  const { status: sessionStatus } = useSession();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<MealLog[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingRecord, setPendingRecord] = useState<PendingRecord | null>(null);
  const [pendingFormError, setPendingFormError] = useState<string | null>(null);
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [expandedFoodRows, setExpandedFoodRows] = useState<Set<number>>(new Set());
  const [pendingFoodsExpanded, setPendingFoodsExpanded] = useState(false);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const refreshLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/memo", {
        cache: "no-store",
        credentials: "include",
      });
      const data = (await res.json()) as { logs?: MealLog[]; error?: string };

      if (res.status === 401) {
        setLogs([]);
        setDbError(
          typeof data.error === "string"
            ? data.error
            : "食事記録の保存・一覧にはログインが必要です。"
        );
        return;
      }

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
    if (sessionStatus === "authenticated") {
      void refreshLogs();
    }
  }, [sessionStatus, refreshLogs]);

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
    setExpandedFoodRows((prev) => {
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

  const clearConversation = () => {
    setChatTurns([]);
    setMessage("");
    setPendingRecord(null);
    setPendingFormError(null);
    setChatError(null);
    setSaveHint(null);
    setPendingFoodsExpanded(false);
  };

  const toggleFoodDetailRow = (id: number) => {
    setExpandedFoodRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        credentials: "include",
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
        credentials: "include",
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

  const savePendingToMemo = async () => {
    if (!pendingRecord) return;
    if (sessionStatus !== "authenticated") {
      setPendingFormError("記録するにはログインしてください。");
      return;
    }
    const total = parseDraftTotal(pendingRecord.draft);
    if (!total) {
      setPendingFormError("カロリー・P・F・C は 0 以上の数値にしてください。");
      return;
    }
    if (!pendingRecord.draft.rawInput.trim()) {
      setPendingFormError("内容（食事の説明）を入力してください。");
      return;
    }

    setPendingFormError(null);
    setIsSavingRecord(true);
    setSaveHint(null);
    try {
      const result = buildPatchedMealResult(pendingRecord.baseNutrition, {
        rawInput: pendingRecord.draft.rawInput,
        foodsLine: pendingRecord.draft.foodsLine,
        total,
      });
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rawInput: pendingRecord.draft.rawInput.trim(),
          result,
        }),
      });
      const memoData = (await res.json()) as { error?: string };

      if (!res.ok) {
        setDbError(
          typeof memoData.error === "string" ? memoData.error : "DBへの保存に失敗しました。"
        );
        return;
      }

      setDbError(null);
      setSaveHint("記録テーブルに保存しました。");
      setPendingRecord(null);
      setChatTurns([]);
      await refreshLogs();
    } catch {
      setPendingFormError("通信エラーにより保存できませんでした。");
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;

    setIsLoading(true);
    setChatError(null);
    setSaveHint(null);
    setPendingFormError(null);
    setPendingRecord(null);

    try {
      const nextMessages: ChatTurn[] = [
        ...chatTurns,
        { role: "user", content: message.trim() },
      ];

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage =
          typeof data.assistantMessage === "string" ? data.assistantMessage : "";
        const nutritionRaw = data.nutrition;
        if (!nutritionRaw || typeof nutritionRaw !== "object") {
          setChatError("応答形式が不正です。");
          return;
        }
        const n = coerceNutrition(nutritionRaw);
        const am =
          assistantMessage.trim() ||
          "推定が完了しました。下記の内容を確認し、問題なければ記録してください。";

        setChatTurns([
          ...nextMessages,
          {
            role: "assistant",
            content: formatAssistantTurnForHistory(am, n),
          },
        ]);
        setMessage("");
        setPendingFoodsExpanded(false);

        const combinedRaw = nextMessages
          .filter((t): t is ChatTurn & { role: "user" } => t.role === "user")
          .map((t) => t.content)
          .join("\n\n");

        setPendingRecord({
          assistantMessage: am,
          baseNutrition: n,
          draft: {
            rawInput: combinedRaw,
            foodsLine: formatFoodsSummary(n),
            kcal: String(n.total.kcal),
            p: String(n.total.p),
            f: String(n.total.f),
            c: String(n.total.c),
          },
        });
      } else {
        const detail =
          typeof data.details === "string" && data.details
            ? `\n（詳細）${data.details}`
            : "";
        const raw =
          typeof data.raw === "string" && data.raw ? `\n（raw）${data.raw}` : "";
        setChatError(
          `${typeof data.error === "string" ? data.error : "エラーが発生しました"}${detail}${raw}`
        );
      }
    } catch {
      setChatError("通信エラーが発生しました");
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
            カロレコAIが、毎日のカロリー/PFCを推定します。
            推定後も下の入力欄に続きを書いて送信すると、直前までの内容を踏まえて再推定します。
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
            {chatTurns.length > 0 ? (
              <div className="rounded-md border border-neutral-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-neutral-600">
                    この食事のやりとり（文脈として AI に渡しています）
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={clearConversation}
                    disabled={isLoading}
                  >
                    会話をクリア
                  </Button>
                </div>
                <ul className="max-h-52 space-y-2 overflow-y-auto text-sm">
                  {chatTurns.map((t, i) => (
                    <li
                      key={`${t.role}-${i}`}
                      className={cn(
                        "rounded-md px-2 py-2",
                        t.role === "user" ? "bg-neutral-100" : "bg-sky-50/80"
                      )}
                    >
                      <span className="text-xs font-semibold text-neutral-500">
                        {t.role === "user" ? "あなた" : "AI"}
                      </span>
                      <p className="mt-0.5 whitespace-pre-wrap text-neutral-800">
                        {t.role === "assistant"
                          ? displayAssistantHistoryContent(t.content)
                          : t.content}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Textarea
              rows={4}
              placeholder={
                chatTurns.length
                  ? "続きの訂正や補足（例: やっぱりからあげは2個でした）を書いて送信してください。"
                  : "例: 朝カロリーメイト、昼はおにぎりと… 夜は麻婆豆腐と米100g など。カロリーとPFCを推定して。"
              }
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

            {chatError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 whitespace-pre-wrap">
                {chatError}
              </div>
            ) : null}

            {pendingRecord ? (
              <div className="space-y-4 rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">AIの回答</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                    {pendingRecord.assistantMessage}
                  </p>
                </div>
                <p className="text-sm font-medium text-neutral-900">
                  このデータを記録してよろしいですか？内容を確認・編集したうえで「記録する」を押してください。
                </p>
                {pendingFormError ? (
                  <p className="text-sm text-red-700">{pendingFormError}</p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="pending-raw" className="mb-1 block text-xs font-medium text-neutral-600">
                      内容（食事の説明）
                    </label>
                    <Textarea
                      id="pending-raw"
                      rows={3}
                      className="text-sm"
                      value={pendingRecord.draft.rawInput}
                      onChange={(e) => {
                        setPendingFormError(null);
                        setPendingRecord((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: { ...prev.draft, rawInput: e.target.value },
                              }
                            : null
                        );
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="pending-foods" className="mb-1 block text-xs font-medium text-neutral-600">
                      内訳（食品）
                    </label>
                    <Textarea
                      id="pending-foods"
                      rows={2}
                      className="text-sm"
                      value={pendingRecord.draft.foodsLine}
                      onChange={(e) => {
                        setPendingFormError(null);
                        setPendingRecord((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: { ...prev.draft, foodsLine: e.target.value },
                              }
                            : null
                        );
                      }}
                    />
                    {pendingRecord.baseNutrition.foods.length > 0 ? (
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          aria-expanded={pendingFoodsExpanded}
                          onClick={() => setPendingFoodsExpanded((v) => !v)}
                        >
                          {pendingFoodsExpanded ? "▼" : "▶"} 食品ごとの kcal / PFC を表示
                        </Button>
                        {pendingFoodsExpanded ? (
                          <ul className="mt-2 space-y-1.5 rounded-md border border-neutral-200 bg-white p-3 text-left">
                            {pendingRecord.baseNutrition.foods.map((food, idx) => (
                              <li
                                key={`pending-f-${idx}`}
                                className="font-mono text-[13px] text-neutral-800"
                              >
                                {formatFoodItemLine(food)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="pending-kcal" className="mb-1 block text-xs font-medium text-neutral-600">
                      カロリー（kcal）
                    </label>
                    <input
                      id="pending-kcal"
                      type="number"
                      inputMode="decimal"
                      className={inputClass}
                      value={pendingRecord.draft.kcal}
                      onChange={(e) => {
                        setPendingFormError(null);
                        setPendingRecord((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: { ...prev.draft, kcal: e.target.value },
                              }
                            : null
                        );
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="pending-p" className="mb-1 block text-xs font-medium text-neutral-600">
                      タンパク質 P（g）
                    </label>
                    <input
                      id="pending-p"
                      type="number"
                      inputMode="decimal"
                      className={inputClass}
                      value={pendingRecord.draft.p}
                      onChange={(e) => {
                        setPendingFormError(null);
                        setPendingRecord((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: { ...prev.draft, p: e.target.value },
                              }
                            : null
                        );
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="pending-f" className="mb-1 block text-xs font-medium text-neutral-600">
                      脂質 F（g）
                    </label>
                    <input
                      id="pending-f"
                      type="number"
                      inputMode="decimal"
                      className={inputClass}
                      value={pendingRecord.draft.f}
                      onChange={(e) => {
                        setPendingFormError(null);
                        setPendingRecord((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: { ...prev.draft, f: e.target.value },
                              }
                            : null
                        );
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="pending-c" className="mb-1 block text-xs font-medium text-neutral-600">
                      炭水化物 C（g）
                    </label>
                    <input
                      id="pending-c"
                      type="number"
                      inputMode="decimal"
                      className={inputClass}
                      value={pendingRecord.draft.c}
                      onChange={(e) => {
                        setPendingFormError(null);
                        setPendingRecord((prev) =>
                          prev
                            ? {
                                ...prev,
                                draft: { ...prev.draft, c: e.target.value },
                              }
                            : null
                        );
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {sessionStatus !== "authenticated" ? (
                    <p className="text-sm text-amber-900">
                      記録するには{" "}
                      <Link href="/login" className="font-medium text-neutral-900 underline">
                        ログイン
                      </Link>{" "}
                      が必要です。
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void savePendingToMemo()}
                    disabled={isSavingRecord || sessionStatus !== "authenticated"}
                  >
                    {isSavingRecord ? "保存中…" : "記録する"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPendingRecord(null);
                      setPendingFormError(null);
                    }}
                    disabled={isSavingRecord}
                  >
                    記録しない
                  </Button>
                  </div>
                </div>
              </div>
            ) : saveHint ? (
              <p className="text-sm font-medium text-emerald-700">{saveHint}</p>
            ) : null}
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
              <table className="min-w-[58rem] w-full border-collapse overflow-hidden rounded-lg border border-neutral-200 bg-white">
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
                    <th className="w-12 px-1 py-3 text-center text-sm font-medium" title="食品ごとの kcal / PFC">
                      品目
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
                    const hasFoods = n.foods.length > 0;
                    const detailOpen = expandedFoodRows.has(log.id);

                    return (
                      <Fragment key={log.id}>
                      <tr
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
                        <td className="border-b border-neutral-200 px-1 py-2 text-center align-top">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 p-0 text-neutral-600"
                            disabled={!hasFoods}
                            aria-expanded={detailOpen}
                            aria-label={detailOpen ? "品目内訳を閉じる" : "品目内訳を開く"}
                            title={hasFoods ? "食品ごとの kcal / PFC" : "品目データなし"}
                            onClick={() => toggleFoodDetailRow(log.id)}
                          >
                            {detailOpen ? "▼" : "▶"}
                          </Button>
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
                      {detailOpen && hasFoods ? (
                        <tr className="bg-neutral-100/90">
                          <td
                            colSpan={10}
                            className="border-b border-neutral-200 px-4 py-3 text-left"
                          >
                            <p className="mb-2 text-xs font-semibold text-neutral-600">
                              食品ごとの内訳（AI 推定）
                            </p>
                            <ul className="space-y-1.5 text-sm leading-relaxed text-neutral-800">
                              {n.foods.map((food, idx) => (
                                <li key={`${log.id}-f-${idx}`} className="font-mono text-[13px]">
                                  {formatFoodItemLine(food)}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                      </Fragment>
                    );
                  })}
                  {!logs.length && (
                    <tr>
                      <td
                        colSpan={10}
                        className="border-b border-neutral-200 px-6 py-6 text-left text-sm text-neutral-500"
                      >
                        {dbError
                          ? "上記の手順でDBを起動・マイグレーションすると、ここに記録が表示されます。"
                          : "まだ記録がありません。食事を送信し、確認画面から記録してください。"}
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
