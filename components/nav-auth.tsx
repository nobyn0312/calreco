"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function NavAuth() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-xs text-neutral-500">読み込み中…</span>;
  }

  if (!session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login">
          <Button variant="secondary" size="sm">
            ログイン
          </Button>
        </Link>
        <Link href="/register">
          <Button size="sm">新規登録</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-neutral-700">
        <span className="text-neutral-500">ログイン中:</span>{" "}
        <strong>{session.user.name}</strong>
      </span>
      <Link href="/account">
        <Button variant="secondary" size="sm">
          アカウント
        </Button>
      </Link>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void signOut({ callbackUrl: "/" })}
      >
        ログアウト
      </Button>
    </div>
  );
}
