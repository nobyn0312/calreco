import type { NutritionJson } from "@/lib/mealNutrition";

/** アシスタント履歴用: 表示文 + 次ターン用の推定 JSON */
export const ASSISTANT_JSON_MARKER = "<<<NUTRITION_JSON>>>";

export function formatAssistantTurnForHistory(
  assistantMessage: string,
  nutrition: NutritionJson
): string {
  return `${assistantMessage.trim()}\n${ASSISTANT_JSON_MARKER}\n${JSON.stringify(nutrition)}`;
}

export function displayAssistantHistoryContent(stored: string): string {
  const i = stored.indexOf(ASSISTANT_JSON_MARKER);
  if (i === -1) return stored.trim();
  return stored.slice(0, i).trim();
}

export type ChatTurn = { role: "user" | "assistant"; content: string };
