"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
        callbackUrl: "/",
      });
      if (res?.error) {
        setError("ユーザー名またはパスワードが正しくありません。");
        return;
      }
      if (res?.ok) {
        router.push(res.url ?? "/");
        router.refresh();
      }
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
            <CardTitle>ログイン</CardTitle>
            {registered ? (
              <p className="text-sm font-medium text-emerald-800">登録が完了しました。ログインしてください。</p>
            ) : (
              <p className="text-sm text-neutral-600">ユーザー名とパスワードでログインします。</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">ユーザー名</label>
              <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">パスワード</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button type="button" onClick={() => void submit()} disabled={loading}>
              {loading ? "ログイン中…" : "ログイン"}
            </Button>
            <p className="text-center text-sm text-neutral-600">
              アカウントをお持ちでない方は{" "}
              <Link href="/register" className="font-medium text-neutral-900 underline">
                新規登録
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 p-6 text-center text-sm">読み込み中…</div>}>
      <LoginForm />
    </Suspense>
  );
}
