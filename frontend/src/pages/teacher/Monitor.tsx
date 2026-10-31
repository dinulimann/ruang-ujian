import { useCallback, useEffect, useState } from "react";
import { Eye, RotateCcw, Timer } from "lucide-react";
import { api, ApiError, type Exam, type MonitorRow } from "../../lib/api";
import { clock, time } from "../../lib/format";
import { useSession } from "../../lib/session";
import { Badge, Button, Spinner } from "../../components/ui";

export default function Monitor({ id }: { id: number }) {
  const { toast } = useSession();
  const [data, setData] = useState<{ exam: Exam; questions: number; server_now: string; students: MonitorRow[] } | null>(null);
  const [offset, setOffset] = useState(0);
  const [, tick] = useState(0);
  const load = useCallback(() => api.teacher.monitor(id).then((d) => { setData(d); setOffset(new Date(d.server_now).getTime() - Date.now()); }), [id]);
  useEffect(() => { load(); const t = setInterval(load, 5000); const c = setInterval(() => tick((x) => x + 1), 1000); return () => { clearInterval(t); clearInterval(c); }; }, [load]);
  if (!data) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  const rows = data.students;
  const counts = { none: rows.filter((r) => !r.attempt).length, working: rows.filter((r) => r.attempt?.status === "in_progress").length, done: rows.filter((r) => r.attempt && r.attempt.status !== "in_progress").length };
  const act = async (fn: () => Promise<unknown>, msg: string) => { try { await fn(); toast(msg); load(); } catch (e) { toast((e as ApiError).message, "bad"); } };
  const now = Date.now() + offset;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="flex items-center gap-2 text-sm font-semibold text-good"><span className="size-2 animate-pulse rounded-full bg-good" /> Live, updates every 5 seconds</p><h1 className="text-3xl font-extrabold">{data.exam.title}</h1><p className="text-muted">{data.exam.class_groups.map((c) => c.name).join(", ")} · {data.questions} questions · {data.exam.duration_minutes} min</p></div>
        <div className="shadow-soft rounded-2xl bg-panel px-6 py-3 text-center"><p className="text-xs font-bold tracking-wider text-muted uppercase">Exam token</p><p className="font-mono text-4xl font-bold tracking-[0.3em] text-brand" data-testid="token">{data.exam.token}</p></div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {([["Not started", counts.none, "text-muted"], ["Working", counts.working, "text-brand"], ["Submitted", counts.done, "text-good"]] as const).map(([l, n, c]) => (
          <div key={l} className="shadow-soft rounded-2xl bg-panel p-4"><p className={`tnum text-3xl font-extrabold ${c}`}>{n}</p><p className="text-sm text-muted">{l}</p></div>
        ))}
      </div>
      <div className="shadow-soft mt-6 overflow-x-auto rounded-2xl bg-panel">
        <table className="w-full min-w-[820px] text-sm" aria-label="Students">
          <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-5 py-3 font-semibold">Student</th><th className="px-3 font-semibold">Status</th><th className="w-56 px-3 font-semibold">Progress</th><th className="px-3 font-semibold">Time left</th><th className="px-3 font-semibold">Left the tab</th><th className="px-5 text-right font-semibold">Actions</th></tr></thead>
          <tbody>{rows.map(({ student: s, attempt: a }) => {
            const left = a ? new Date(a.deadline_at).getTime() - now : 0;
            return (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3"><p className="font-semibold">{s.name}</p><p className="text-xs text-muted">{s.number} · {s.class}</p></td>
                <td className="px-3">{!a ? <Badge>Not started</Badge> : a.status === "in_progress" ? <Badge tone="brand">Working</Badge> : <Badge tone="good">{a.auto_submitted ? "Time ran out" : "Submitted"}</Badge>}</td>
                <td className="px-3">{a && <div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand" style={{ width: `${(a.answered / data.questions) * 100}%` }} /></div><span className="tnum w-12 text-xs text-muted">{a.answered}/{data.questions}</span></div>}{a?.last_saved && a.status === "in_progress" && <p className="text-[11px] text-muted">last saved {time(a.last_saved)}</p>}</td>
                <td className="tnum px-3 font-mono">{a?.status === "in_progress" ? <span className={left < 5 * 60_000 ? "font-bold text-flag" : ""}>{clock(left)}</span> : "—"}{a && a.extra_minutes > 0 && <span className="ml-1 text-xs text-brand">+{a.extra_minutes}</span>}</td>
                <td className="px-3">{a && a.tab_switches > 0 ? <Badge tone="warn"><Eye size={12} /> {a.tab_switches}×</Badge> : a ? <span className="text-muted">0</span> : null}</td>
                <td className="px-5 text-right">{a?.status === "in_progress" && <div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => act(() => api.teacher.extend(a.id, 10), `${s.name}: +10 minutes`)} aria-label={`Give ${s.name} 10 more minutes`}><Timer size={14} /> +10</Button>
                  {a.device_locked && <Button size="sm" variant="ghost" onClick={() => act(() => api.teacher.resetDevice(a.id), `${s.name} can continue on another device`)} aria-label={`Release ${s.name}'s device`}><RotateCcw size={14} /> Device</Button>}
                </div>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
