import { useId, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { chartSeries, rangeStart, type ChartPoint, type RangeKey } from '../lib/calculations';
import { formatDate, formatNumber } from '../lib/format';
import type { SessionResult } from '../lib/progression';
import { Segmented } from './ui';

export interface Point {
  date: number;
  value: number;
}

const AXIS = { fontSize: 11, fill: 'var(--text-3)' } as const;

function ChartTooltip({ active, payload, unit }: Partial<TooltipContentProps<number, string>> & { unit: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="rounded-xl border border-line bg-surface-3 px-3 py-2 text-[12px] shadow-xl shadow-black/30">
      <div className="text-ink-3">{formatDate(p.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      <div className="tnum mt-0.5 text-[14px] font-semibold text-ink">
        {formatNumber(p.value)} {unit}
      </div>
    </div>
  );
}

/** Single-series chart: area-line for trends, bars for per-session totals. */
export function TrendChart({ data, unit, kind = 'line', height = 180, label }: { data: Point[]; unit: string; kind?: 'line' | 'bar'; height?: number; label: string }) {
  const gid = `g${useId().replace(/:/g, '')}`;
  if (data.length === 0) return <div className="flex h-32 items-center justify-center rounded-xl bg-surface-2 text-[13px] text-ink-3">No data in this range</div>;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, (max - min) * 0.15);
  const domain: [number, number] = kind === 'bar' ? [0, Math.ceil(max * 1.1)] : [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  const common = { data, margin: { top: 8, right: 8, bottom: 0, left: -12 } };
  const xAxis = <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatDate(t)} tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} padding={{ left: 8, right: 8 }} />;
  const yAxis = <YAxis domain={domain} tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))} allowDecimals={false} />;
  const grid = <CartesianGrid vertical={false} stroke="var(--grid)" />;
  const tooltip = <Tooltip content={<ChartTooltip unit={unit} />} cursor={kind === 'bar' ? { fill: 'var(--surface-2)' } : { stroke: 'var(--text-3)', strokeDasharray: '3 3' }} />;

  return (
    <figure aria-label={label} className="m-0">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'bar' ? (
            <BarChart {...common} barCategoryGap="20%">
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          ) : (
            <AreaChart {...common}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid}
              {xAxis}
              {yAxis}
              {tooltip}
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                fill={`url(#${gid})`}
                dot={data.length <= 24 ? { r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {label}: {data.map((d) => `${formatDate(d.date)} ${formatNumber(d.value)} ${unit}`).join('; ')}
      </figcaption>
    </figure>
  );
}

const RANGES: RangeKey[] = ['1M', '3M', '6M', '1Y', 'All'];

export function RangePicker({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return <Segmented label="Time range" value={value} onChange={onChange} options={RANGES.map((r) => ({ value: r, label: r }))} />;
}

/** The three exercise charts with a shared time filter. */
export function ExerciseCharts({ history, units }: { history: SessionResult[]; units: string }) {
  const [range, setRange] = useState<RangeKey>('3M');
  const series = useMemo(() => {
    const from = rangeStart(range, Date.now());
    return chartSeries(history).filter((p) => p.date >= from);
  }, [history, range]);
  const pick = (k: keyof Omit<ChartPoint, 'date'>): Point[] => series.map((p) => ({ date: p.date, value: p[k] }));

  return (
    <div className="space-y-5">
      <RangePicker value={range} onChange={setRange} />
      <ChartBlock title="Top set weight" sub="Heaviest working set each session">
        <TrendChart data={pick('topWeight')} unit={units} label="Top set weight over time" />
      </ChartBlock>
      <ChartBlock title="Estimated 1-rep max" sub="Epley: weight x (1 + reps / 30)">
        <TrendChart data={pick('e1rm')} unit={units} label="Estimated one rep max over time" />
      </ChartBlock>
      <ChartBlock title="Volume per session" sub="Weight x reps, working sets">
        <TrendChart data={pick('volume')} unit={units} kind="bar" label="Volume per session" />
      </ChartBlock>
    </div>
  );
}

export function ChartBlock({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
