"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartPoint {
  label: string;
  value: number;
}

const NAVY = "#1F3864";
const PALETTE = ["#1F3864", "#4a69a8", "#8ba3cc", "#b45309", "#b91c1c", "#2c4a7e", "#6b7280"];

const inrCompact = (n: number) => {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(n);
};
const inrFull = (n: number) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;

function MoneyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium">{label}</p>
      <p className="tabular-nums text-primary">{inrFull(payload[0].value)}</p>
    </div>
  );
}

export function MonthlySpendChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" fontSize={11} tickLine={false} />
        <YAxis fontSize={11} tickFormatter={inrCompact} tickLine={false} width={44} />
        <Tooltip content={<MoneyTooltip />} />
        <Line type="monotone" dataKey="value" stroke={NAVY} strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SpendByBarChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" fontSize={10} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis fontSize={11} tickFormatter={inrCompact} tickLine={false} width={44} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: "#eef2f8" }} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
