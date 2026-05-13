import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { coerceNutrition, buildPatchedMealResult } from "@/lib/mealNutrition";

function dbUnavailableMessage(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes("Can't reach database server") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("P1001")
  ) {
    return "PostgreSQL に接続できません。Docker Desktop を起動し、`docker compose up -d db` のあと `npx prisma migrate deploy`（または `migrate dev`）を実行してください。";
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  ) {
    return "DB にテーブルがありません（マイグレーション未適用の可能性）。`DATABASE_URL` が指す PostgreSQL に `npx prisma migrate deploy` を実行してスキーマを作成してください。";
  }
  return null;
}

export async function GET() {
  try {
    const logs = await prisma.mealLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("memo GET error:", error);
    const hint = dbUnavailableMessage(error);
    return NextResponse.json(
      {
        error: hint ?? "一覧の取得に失敗しました",
        logs: [],
      },
      { status: hint ? 503 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInput = body?.rawInput;
    const result = body?.result;

    if (typeof rawInput !== "string" || !rawInput.trim()) {
      return NextResponse.json({ error: "rawInput が必要です" }, { status: 400 });
    }
    if (typeof result !== "object" || result === null) {
      return NextResponse.json({ error: "result(JSON) が必要です" }, { status: 400 });
    }

    const normalized = coerceNutrition(result);

    const created = await prisma.mealLog.create({
      data: {
        rawInput: rawInput.trim(),
        result: normalized,
        totalKcal: normalized.total.kcal,
        totalP: normalized.total.p,
        totalF: normalized.total.f,
        totalC: normalized.total.c,
      },
    });

    return NextResponse.json({ log: created }, { status: 201 });
  } catch (error) {
    console.error("memo POST error:", error);
    const hint = dbUnavailableMessage(error);
    return NextResponse.json(
      { error: hint ?? "保存に失敗しました" },
      { status: hint ? 503 : 500 }
    );
  }
}

const DELETE_MAX_IDS = 100;

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
    const idsRaw = body?.ids;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json(
        { error: "ids（非空の配列）が必要です。例: { \"ids\": [1, 2, 3] }" },
        { status: 400 }
      );
    }

    const parsed: number[] = [];
    for (const x of idsRaw) {
      if (typeof x !== "number" || !Number.isInteger(x) || x < 1) {
        return NextResponse.json(
          { error: "ids の各要素は 1 以上の整数にしてください" },
          { status: 400 }
        );
      }
      parsed.push(x);
    }

    const unique = [...new Set(parsed)];
    if (unique.length > DELETE_MAX_IDS) {
      return NextResponse.json(
        { error: `一度に削除できるのは最大 ${DELETE_MAX_IDS} 件までです` },
        { status: 400 }
      );
    }

    const result = await prisma.mealLog.deleteMany({
      where: { id: { in: unique } },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("memo DELETE error:", error);
    const hint = dbUnavailableMessage(error);
    return NextResponse.json(
      { error: hint ?? "削除に失敗しました" },
      { status: hint ? 503 : 500 }
    );
  }
}

const PATCH_MAX_ITEMS = 50;

function parseTotalForPatch(
  t: unknown
): { kcal: number; p: number; f: number; c: number } | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const keys = ["kcal", "p", "f", "c"] as const;
  const out: { kcal: number; p: number; f: number; c: number } = {
    kcal: 0,
    p: 0,
    f: 0,
    c: 0,
  };
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
    const itemsRaw = body?.items;
    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      return NextResponse.json(
        { error: "items（非空の配列）が必要です。例: { \"items\": [{ \"id\": 1, \"rawInput\": \"…\", \"foodsLine\": \"…\", \"total\": { \"kcal\": 0, \"p\": 0, \"f\": 0, \"c\": 0 } }] }" },
        { status: 400 }
      );
    }
    if (itemsRaw.length > PATCH_MAX_ITEMS) {
      return NextResponse.json(
        { error: `一度に更新できるのは最大 ${PATCH_MAX_ITEMS} 件までです` },
        { status: 400 }
      );
    }

    const rows: Array<{
      id: number;
      rawInput: string;
      foodsLine: string;
      total: { kcal: number; p: number; f: number; c: number };
    }> = [];

    for (const item of itemsRaw) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "items の各要素はオブジェクトにしてください" }, { status: 400 });
      }
      const o = item as Record<string, unknown>;
      const id = o.id;
      if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
        return NextResponse.json({ error: "各 item に正の整数 id が必要です" }, { status: 400 });
      }
      const rawInput = o.rawInput;
      if (typeof rawInput !== "string") {
        return NextResponse.json({ error: "各 item に文字列 rawInput が必要です" }, { status: 400 });
      }
      const foodsLine = o.foodsLine;
      const foodsLineStr = typeof foodsLine === "string" ? foodsLine : "";
      const total = parseTotalForPatch(o.total);
      if (!total) {
        return NextResponse.json(
          { error: "各 item に total（kcal, p, f, c は 0 以上の有限数）が必要です" },
          { status: 400 }
        );
      }
      rows.push({
        id,
        rawInput: rawInput.trim(),
        foodsLine: foodsLineStr,
        total,
      });
    }

    const uniqueIds = [...new Set(rows.map((r) => r.id))];
    if (uniqueIds.length !== rows.length) {
      return NextResponse.json({ error: "同じ id が items 内に重複しています" }, { status: 400 });
    }

    const existing = await prisma.mealLog.findMany({
      where: { id: { in: uniqueIds } },
    });
    if (existing.length !== uniqueIds.length) {
      const found = new Set(existing.map((e) => e.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      return NextResponse.json(
        { error: `存在しない id があります: ${missing.join(", ")}` },
        { status: 404 }
      );
    }

    const byId = new Map(existing.map((e) => [e.id, e]));

    await prisma.$transaction(
      rows.map((row) => {
        const prev = byId.get(row.id)!;
        const normalized = buildPatchedMealResult(prev.result, {
          rawInput: row.rawInput,
          foodsLine: row.foodsLine,
          total: row.total,
        });
        return prisma.mealLog.update({
          where: { id: row.id },
          data: {
            rawInput: row.rawInput,
            result: normalized,
            totalKcal: row.total.kcal,
            totalP: row.total.p,
            totalF: row.total.f,
            totalC: row.total.c,
          },
        });
      })
    );

    return NextResponse.json({ updated: rows.length });
  } catch (error) {
    console.error("memo PATCH error:", error);
    const hint = dbUnavailableMessage(error);
    return NextResponse.json(
      { error: hint ?? "更新に失敗しました" },
      { status: hint ? 503 : 500 }
    );
  }
}
