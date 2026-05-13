export type NutritionJson = {
  foods: Array<{
    name: string;
    amount?: string;
    kcal: number;
    p: number;
    f: number;
    c: number;
  }>;
  total: { kcal: number; p: number; f: number; c: number };
  notes?: string;
  /** 手動編集した「内訳」一行表示。ある場合は formatFoodsSummary がこれを優先 */
  foodsSummary?: string;
};

/** DBやAIの揺れを吸収して、表表示・保存用に揃える */
export function coerceNutrition(result: unknown): NutritionJson {
  const emptyTotal = { kcal: 0, p: 0, f: 0, c: 0 };
  if (!result || typeof result !== "object") {
    return { foods: [], total: emptyTotal };
  }
  const obj = result as Record<string, unknown>;

  const totalSrc = obj.total;
  const total =
    totalSrc && typeof totalSrc === "object"
      ? {
          kcal: Number((totalSrc as Record<string, unknown>).kcal) || 0,
          p: Number((totalSrc as Record<string, unknown>).p) || 0,
          f: Number((totalSrc as Record<string, unknown>).f) || 0,
          c: Number((totalSrc as Record<string, unknown>).c) || 0,
        }
      : emptyTotal;

  const foodsRaw = Array.isArray(obj.foods) ? obj.foods : [];
  const foods = foodsRaw.map((item) => {
    if (!item || typeof item !== "object") {
      return { name: "?", kcal: 0, p: 0, f: 0, c: 0 };
    }
    const row = item as Record<string, unknown>;
    const amount = row.amount;
    return {
      name: String(row.name ?? "?"),
      amount: amount === undefined || amount === null ? undefined : String(amount),
      kcal: Number(row.kcal) || 0,
      p: Number(row.p) || 0,
      f: Number(row.f) || 0,
      c: Number(row.c) || 0,
    };
  });

  const notes = obj.notes;
  const fs = obj.foodsSummary;
  const foodsSummary =
    typeof fs === "string" && fs.trim() ? fs.trim() : undefined;

  const base: NutritionJson = {
    foods,
    total,
    notes: typeof notes === "string" && notes.trim() ? notes : undefined,
  };
  if (foodsSummary) base.foodsSummary = foodsSummary;
  return base;
}

export function formatFoodsSummary(n: NutritionJson): string {
  if (n.foodsSummary?.trim()) return n.foodsSummary.trim();
  if (!n.foods.length) return "—";
  return n.foods
    .map((food) => {
      const amt = food.amount ? ` (${food.amount})` : "";
      return `${food.name}${amt}`;
    })
    .join(" · ");
}

/** 手動修正後の result JSON を組み立てる（foods 配列は維持、total と任意の foodsSummary を上書き） */
export function buildPatchedMealResult(
  existing: unknown,
  patch: {
    rawInput: string;
    foodsLine: string;
    total: { kcal: number; p: number; f: number; c: number };
  }
): NutritionJson {
  const base = coerceNutrition(existing);
  const out: NutritionJson = {
    foods: base.foods,
    total: patch.total,
    notes: base.notes,
  };
  const trimmed = patch.foodsLine.trim();
  if (trimmed) out.foodsSummary = trimmed;
  return out;
}