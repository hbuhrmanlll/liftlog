import { useState } from 'react';
import { epley1RM } from '../lib/calculations';
import { formatDate, formatNumber, formatWeight } from '../lib/format';
import type { SessionResult } from '../lib/progression';
import { Button, Card } from './ui';

/** Every set of every session for one exercise, newest first. */
export function SetLogTable({ history, units, bodyweight }: { history: SessionResult[]; units: string; bodyweight: boolean }) {
  const [shown, setShown] = useState(8);
  const fmt = (w: number) => (bodyweight ? (w > 0 ? `BW +${formatWeight(w)}` : 'BW') : `${formatWeight(w)} ${units}`);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-[15px] font-semibold">Set-by-set log</h3>
        <p className="text-[12px] text-ink-3">Every working set you've logged. RIR = reps left in the tank.</p>
      </div>
      <ul className="divide-y divide-line">
        {history.slice(0, shown).map((h) => {
          const best = Math.max(...h.sets.map((s) => epley1RM(s.weight, s.reps)));
          return (
            <li key={h.date} className="px-4 py-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-medium text-ink">{formatDate(h.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                <span className="tnum text-[12px] text-ink-3">best e1RM {formatNumber(best)}</span>
              </div>
              <table className="w-full text-[13px]">
                <thead className="sr-only">
                  <tr>
                    <th>Set</th>
                    <th>Weight</th>
                    <th>Reps</th>
                    <th>RIR</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {h.sets.map((s, i) => (
                    <tr key={i}>
                      <td className="w-14 py-0.5 text-ink-3">Set {i + 1}</td>
                      <td className="py-0.5 text-ink">{fmt(s.weight)}</td>
                      <td className="py-0.5 text-ink">× {s.reps}</td>
                      <td className="py-0.5 text-right text-ink-3">{s.rir === null ? '' : `RIR ${s.rir >= 4 ? '4+' : s.rir}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          );
        })}
      </ul>
      {history.length > shown && (
        <div className="border-t border-line p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShown((n) => n + 20)}>
            Show older sessions ({history.length - shown} more)
          </Button>
        </div>
      )}
    </Card>
  );
}
