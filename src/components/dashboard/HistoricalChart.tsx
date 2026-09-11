import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useDailyHistorical, type DashboardQueryParams } from '@/hooks/use-dashboard-query';

const LINE_CONFIG = [
  { key: 'faturamento',         label: 'Faturamento',        color: '#0f4c5c', dashed: false },
  { key: 'custo',               label: 'Custo',              color: '#ef4444', dashed: false },
  { key: 'lucro',               label: 'Lucro',              color: '#16a34a', dashed: false },
  { key: 'gastos_fixos',        label: 'Custo Fixo',         color: '#f59e0b', dashed: false },
  { key: 'ganhos_financeiros',  label: 'Ganhos Financeiros', color: '#2F6BFF', dashed: false },
  { key: 'fretes',              label: 'Fretes',             color: '#9b6bff', dashed: false },
  { key: 'ano_anterior',        label: 'Fat. Ano Anterior',  color: '#9ca3af', dashed: true },
] as const;

type LineKey = (typeof LINE_CONFIG)[number]['key'];

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function formatDate(iso: string) {
  const [, , day] = iso.split('-');
  return `${day}`;
}

interface HistoricalChartProps {
  params: DashboardQueryParams;
}

export function HistoricalChart({ params }: HistoricalChartProps) {
  const [visible, setVisible] = useState<Record<LineKey, boolean>>({
    faturamento: true,
    custo: true,
    lucro: true,
    gastos_fixos: true,
    ganhos_financeiros: true,
    fretes: true,
    ano_anterior: true,
  });

  const { data, isLoading } = useDailyHistorical(params);

  const chartData = (data?.items ?? []).map(item => ({
    date: formatDate(item.data),
    faturamento: Number(item.faturamento),
    custo: Number(item.custo),
    lucro: Number(item.lucro),
    gastos_fixos: Number(item.gastos_fixos),
    ganhos_financeiros: Number(item.ganhos_financeiros),
    fretes: Number(item.fretes),
    ano_anterior: Number(item.ano_anterior),
  }));

  const toggle = (key: LineKey) =>
    setVisible(prev => ({ ...prev, [key]: !prev[key] }));

  const xInterval = chartData.length > 15 ? 1 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-secondary">Análise Histórica — Diário</CardTitle>

          <div className="flex items-center gap-4 flex-wrap">
            {LINE_CONFIG.map(({ key, label, color }) => (
              <label
                key={key}
                className="flex items-center gap-1.5 cursor-pointer select-none text-xs"
              >
                <input
                  type="checkbox"
                  checked={visible[key]}
                  onChange={() => toggle(key)}
                  className="cursor-pointer"
                  style={{ accentColor: color }}
                />
                <span className={cn(!visible[key] && 'text-muted-foreground line-through')}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[440px] w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={440}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                interval={xInterval}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                width={60}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                formatter={(value: number, name: string) => [BRL(value), name]}
              />

              {LINE_CONFIG.map(({ key, label, color, dashed }) =>
                visible[key] ? (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={color}
                    strokeWidth={1.5}
                    strokeDasharray={dashed ? '5 5' : undefined}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ) : null,
              )}
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="mt-2 flex justify-center gap-5 flex-wrap">
          {LINE_CONFIG.map(({ key, label, color, dashed }) => (
            <span key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
              <svg width="20" height="10">
                <line
                  x1="0" y1="5" x2="20" y2="5"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray={dashed ? '4 3' : undefined}
                />
                <circle cx="10" cy="5" r="3" fill={color} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
