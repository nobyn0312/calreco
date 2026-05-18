import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TZ_OFFSET_MIN = 9 * 60; // JST (Asia/Tokyo, no DST)

function toJstDateString(d: Date): string {
  const ms = d.getTime() + TZ_OFFSET_MIN * 60 * 1000;
  const j = new Date(ms);
  const y = j.getUTCFullYear();
  const m = String(j.getUTCMonth() + 1).padStart(2, "0");
  const day = String(j.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function jstDayStartUtc(d: Date): Date {
  const ms = d.getTime() + TZ_OFFSET_MIN * 60 * 1000;
  const j = new Date(ms);
  j.setUTCHours(0, 0, 0, 0);
  return new Date(j.getTime() - TZ_OFFSET_MIN * 60 * 1000);
}

function dbUnavailableMessage(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes("Can't reach database server") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("P1001")
  ) {
    return "PostgreSQL に接続できません。Docker と DB を起動してください。";
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  ) {
    return "DB にテーブルがありません（マイグレーション未適用の可能性）。";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "ログインが必要です", days: [] }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days =
    Number.isFinite(daysParam) && daysParam >= 1 && daysParam <= 31
      ? Math.floor(daysParam)
      : 7;

  const now = new Date();
  const todayStart = jstDayStartUtc(now);
  const fromStart = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

  try {
    const logs = await prisma.mealLog.findMany({
      where: {
        userId: session.user.id,
        createdAt: { gte: fromStart },
      },
      select: {
        createdAt: true,
        totalKcal: true,
        totalP: true,
        totalF: true,
        totalC: true,
      },
    });

    type Bucket = {
      date: string;
      kcal: number;
      protein: number;
      fat: number;
      carbs: number;
    };

    const buckets = new Map<string, Bucket>();
    for (let i = 0; i < days; i++) {
      const d = new Date(todayStart.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = toJstDateString(d);
      buckets.set(key, { date: key, kcal: 0, protein: 0, fat: 0, carbs: 0 });
    }

    for (const log of logs) {
      const key = toJstDateString(log.createdAt);
      const b = buckets.get(key);
      if (!b) continue;
      b.kcal += log.totalKcal ?? 0;
      b.protein += log.totalP ?? 0;
      b.fat += log.totalF ?? 0;
      b.carbs += log.totalC ?? 0;
    }

    const result = Array.from(buckets.values()).map((b) => ({
      date: b.date,
      kcal: Math.round(b.kcal),
      protein: Math.round(b.protein),
      fat: Math.round(b.fat),
      carbs: Math.round(b.carbs),
    }));

    return NextResponse.json({ days: result });
  } catch (error) {
    console.error("stats daily error:", error);
    const hint = dbUnavailableMessage(error);
    return NextResponse.json(
      { error: hint ?? "集計に失敗しました", days: [] },
      { status: hint ? 503 : 500 }
    );
  }
}
