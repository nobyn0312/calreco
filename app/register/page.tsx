"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("unspecified");
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          age: Number(age),
          gender,
          heightCm: Number(heightCm),
          weightKg: Number(weightKg),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "登録に失敗しました。");
        return;
      }
      router.push("/login?registered=1");
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>新規登録</CardTitle>
            <p className="text-sm text-neutral-600">
              ユーザー名・パスワードとプロフィールを登録します。目標の PFC は後から AI で設定する予定です。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">ユーザー名（英数字_・3〜30）</label>
              <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">パスワード（8文字以上）</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">年齢</label>
              <input className={inputClass} type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">性別</label>
              <select className={inputClass} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="unspecified">回答しない</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">身長（cm）</label>
              <input className={inputClass} type="number" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">体重（kg）</label>
              <input className={inputClass} type="number" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button type="button" onClick={() => void submit()} disabled={loading}>
              {loading ? "送信中…" : "登録する"}
            </Button>
            <p className="text-center text-sm text-neutral-600">
              すでにアカウントがある方は{" "}
              <Link href="/login" className="font-medium text-neutral-900 underline">
                ログイン
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
