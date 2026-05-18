"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type TrendDay = {
  date: string; // YYYY-MM-DD (JST)
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type TrendGoal = {
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
};

type Metric = "kcal" | "protein" | "fat" | "carbs";

const METRIC_LABEL: Record<Metric, string> = {
  kcal: "カロリー",
  protein: "タンパク質",
  fat: "脂質",
  carbs: "炭水化物",
};

const METRIC_UNIT: Record<Metric, string> = {
  kcal: "kcal",
  protein: "g",
  fat: "g",
  carbs: "g",
};

const METRIC_COLOR: Record<Metric, string> = {
  kcal: "#0a0a0a",
  protein: "#0369a1",
  fat: "#b45309",
  carbs: "#15803d",
};

const METRIC_FLOOR: Record<Metric, number> = {
  kcal: 1500,
  protein: 60,
  fat: 40,
  carbs: 150,
};

export function WeeklyTrendChart({
  days,
  goal,
}: {
  days: TrendDay[];
  goal?: TrendGoal;
}) {
  const [metric, setMetric] = React.useState<Metric>("kcal");

  const goalValue = pickGoal(goal, metric);
  const values = days.map((d) => d[metric]);

  const yMaxRaw = Math.max(
    ...values,
    goalValue ?? 0,
    METRIC_FLOOR[metric]
  );
  const yMax = niceMax(yMaxRaw);

  const W = 600;
  const H = 200;
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xFor = (i: number) =>
    days.length === 1
      ? padL + innerW / 2
      : padL + (innerW * i) / (days.length - 1);
  const yFor = (v: number) =>
    padT + innerH - (Math.max(0, Math.min(yMax, v)) / yMax) * innerH;

  const linePath = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`
    )
    .join(" ");

  const areaPath =
    values.length > 0
      ? `M ${xFor(0).toFixed(2)} ${(padT + innerH).toFixed(2)} ` +
        values
          .map((v, i) => `L ${xFor(i).toFixed(2)} ${yFor(v).toFixed(2)}`)
          .join(" ") +
        ` L ${xFor(values.length - 1).toFixed(2)} ${(padT + innerH).toFixed(2)} Z`
      : "";

  const ticks = niceTicks(yMax, 4);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = days.length ? Math.round(total / days.length) : 0;
  const today = values[values.length - 1] ?? 0;
  const color = METRIC_COLOR[metric];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              m === metric
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
            )}
          >
            {METRIC_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="今日" value={`${Math.round(today)} ${METRIC_UNIT[metric]}`} />
        <SummaryTile label="1日平均" value={`${avg} ${METRIC_UNIT[metric]}`} />
        <SummaryTile
          label="目標"
          value={goalValue != null ? `${Math.round(goalValue)} ${METRIC_UNIT[metric]}` : "—"}
        />
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${METRIC_LABEL[metric]} の 1 週間推移`}
          className="w-full min-w-[420px] text-neutral-500"
        >
          {ticks.map((t) => {
            const y = yFor(t);
            return (
              <g key={t}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.12"
                />
                <text
                  x={padL - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="currentColor"
                >
                  {Math.round(t)}
                </text>
              </g>
            );
          })}

          {goalValue != null && goalValue > 0 ? (
            <line
              x1={padL}
              x2={W - padR}
              y1={yFor(goalValue)}
              y2={yFor(goalValue)}
              stroke={color}
              strokeOpacity="0.45"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          ) : null}

          {areaPath ? <path d={areaPath} fill={color} fillOpacity="0.08" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {values.map((v, i) => (
            <circle
              key={days[i]?.date ?? i}
              cx={xFor(i)}
              cy={yFor(v)}
              r="3.5"
              fill="white"
              stroke={color}
              strokeWidth="1.5"
            />
          ))}

          {days.map((d, i) => (
            <text
              key={d.date}
              x={xFor(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {formatXLabel(d.date)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white px-3 py-2">
      <p className="text-[10px] text-neutral-500">{label}</p>
      <p className="text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function pickGoal(goal: TrendGoal | undefined, metric: Metric): number | null {
  if (!goal) return null;
  const v =
    metric === "kcal"
      ? goal.kcal
      : metric === "protein"
      ? goal.protein
      : metric === "fat"
      ? goal.fat
      : goal.carbs;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const m = v / base;
  let nice: number;
  if (m <= 1) nice = 1;
  else if (m <= 2) nice = 2;
  else if (m <= 5) nice = 5;
  else nice = 10;
  return nice * base;
}

function niceTicks(max: number, count: number): number[] {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

function formatXLabel(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}
