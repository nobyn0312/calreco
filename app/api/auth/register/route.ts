import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const GENDERS = new Set(["male", "female", "other", "unspecified"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const age = body.age;
    const gender = typeof body.gender === "string" ? body.gender.trim() : "";
    const heightCm = body.heightCm;
    const weightKg = body.weightKg;

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "ユーザー名は 3〜30 文字の英数字とアンダースコアのみにしてください。" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは 8 文字以上にしてください。" },
        { status: 400 }
      );
    }
    if (typeof age !== "number" || !Number.isInteger(age) || age < 1 || age > 120) {
      return NextResponse.json({ error: "年齢は 1〜120 の整数で入力してください。" }, { status: 400 });
    }
    if (!GENDERS.has(gender)) {
      return NextResponse.json(
        { error: "性別は male / female / other / unspecified のいずれかにしてください。" },
        { status: 400 }
      );
    }
    if (typeof heightCm !== "number" || !Number.isFinite(heightCm) || heightCm < 50 || heightCm > 250) {
      return NextResponse.json(
        { error: "身長（cm）は 50〜250 の数値で入力してください。" },
        { status: 400 }
      );
    }
    if (typeof weightKg !== "number" || !Number.isFinite(weightKg) || weightKg < 15 || weightKg > 300) {
      return NextResponse.json(
        { error: "体重（kg）は 15〜300 の数値で入力してください。" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(password);

    await prisma.user.create({
      data: {
        username,
        passwordHash,
        age,
        gender,
        heightCm,
        weightKg,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e: unknown) {
    const code =
      e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "このユーザー名はすでに使われています。" }, { status: 409 });
    }
    console.error("register error:", e);
    return NextResponse.json({ error: "登録に失敗しました。" }, { status: 500 });
  }
}
