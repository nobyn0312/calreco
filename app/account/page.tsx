"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  WeeklyTrendChart,
  type TrendDay,
} from "@/components/charts/WeeklyTrendChart";

type MeUser = {
  username: string;
  age: number;
  gender: string;
  heightCm: number;
  weightKg: number;
  targetProteinG: number | null;
  targetFatG: number | null;
  targetCarbsG: number | null;
  targetKcal: number | null;
  pfcSetAt: string | null;
};

const genderLabel: Record<string, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
  unspecified: "回答しない",
};

function formatBodyNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function ProfileRow({
  label,
  value,
  emphasized,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-sm font-medium text-neutral-500">{label}</dt>
      <dd
        className={
          emphasized ? "text-lg font-semibold tracking-tight text-neutral-900" : "text-base text-neutral-900"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default function AccountPage() {
  const { status } = useSession();
  const [user, setUser] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trend, setTrend] = useState<TrendDay[] | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    void (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        const data = (await res.json()) as { user?: MeUser; error?: string };
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "読み込みに失敗しました。");
          return;
        }
        if (data.user) setUser(data.user);
      } catch {
        setError("通信に失敗しました。");
      }
    })();
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void (async () => {
      try {
        const res = await fetch("/api/stats/daily?days=7", { credentials: "include" });
        const data = (await res.json()) as { days?: TrendDay[]; error?: string };
        if (!res.ok) {
          setTrendError(
            typeof data.error === "string" ? data.error : "推移の取得に失敗しました。"
          );
          setTrend(data.days ?? []);
          return;
        }
        setTrend(Array.isArray(data.days) ? data.days : []);
      } catch {
        setTrendError("通信に失敗しました。");
        setTrend([]);
      }
    })();
  }, [status]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-neutral-50 p-6 text-center text-sm text-neutral-600">読み込み中…</div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-md text-center">
          <p className="text-neutral-700">ログインが必要です。</p>
          <Link href="/login" className="mt-4 inline-block font-medium text-neutral-900 underline">
            ログインへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>アカウント</CardTitle>
            <p className="text-sm text-neutral-600">登録したプロフィールと、今後 AI が設定する目標 PFC の枠です。</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            {user ? (
              <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
                <ProfileRow label="名前" value={user.username} emphasized />
                <ProfileRow label="性別" value={genderLabel[user.gender] ?? user.gender} />
                <ProfileRow label="年齢" value={`${user.age} 歳`} />
                <ProfileRow label="身長" value={`${formatBodyNumber(user.heightCm)} cm`} />
                <ProfileRow label="体重" value={`${formatBodyNumber(user.weightKg)} kg`} />
              </dl>
            ) : (
              !error && <p className="text-sm text-neutral-600">読み込み中…</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>1 週間の推移</CardTitle>
            <p className="text-sm text-neutral-600">
              直近 7 日間の食事記録から日別合計を集計しています（JST 基準）。
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {trendError ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {trendError}
              </p>
            ) : null}
            {trend ? (
              trend.length === 0 ? (
                <p className="text-sm text-neutral-600">表示できるデータがありません。</p>
              ) : (
                <WeeklyTrendChart
                  days={trend}
                  goal={
                    user
                      ? {
                          kcal: user.targetKcal,
                          protein: user.targetProteinG,
                          fat: user.targetFatG,
                          carbs: user.targetCarbsG,
                        }
                      : undefined
                  }
                />
              )
            ) : (
              <p className="text-sm text-neutral-600">読み込み中…</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>目標 PFC（AI で後から設定）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-neutral-700">
            <p>
              目標体重に向けた 1 日あたりの PFC バランスは、今後 Gemini などで自動設定する想定です。設定されると
              <code className="mx-1 rounded bg-neutral-100 px-1">targetProteinG</code> などのカラムに保存されます。
            </p>
            {user &&
            user.targetProteinG != null &&
            user.targetFatG != null &&
            user.targetCarbsG != null ? (
              <dl className="grid gap-2 rounded-md border border-neutral-200 bg-white p-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-neutral-500">タンパク質（目標 / 日）</dt>
                  <dd>{user.targetProteinG} g</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">脂質（目標 / 日）</dt>
                  <dd>{user.targetFatG} g</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">炭水化物（目標 / 日）</dt>
                  <dd>{user.targetCarbsG} g</dd>
                </div>
                {user.targetKcal != null ? (
                  <div>
                    <dt className="text-xs text-neutral-500">カロリー（目標 / 日）</dt>
                    <dd>{user.targetKcal} kcal</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                まだ目標 PFC は未設定です。AI 連携を実装したあと、トップの食事記録と比較できるようにします。
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm">
          <Link href="/" className="text-neutral-700 underline">
            トップへ戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
