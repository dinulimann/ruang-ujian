import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, Download } from "lucide-react";
import { api, type Item, type Results as R } from "../../lib/api";
import { dateTime, num } from "../../lib/format";
import { Badge, Spinner } from "../../components/ui";

const FLAG: Record<string, [string, "warn" | "bad" | "neutral"]> = {
  hard: ["Hard: under 30% right", "warn"], easy: ["Easy: over 90% right", "neutral"], low_discrimination: ["Does not separate strong from weak", "warn"],
  negative_discrimination: ["Weaker students do better: check the key", "bad"], unused_distractor: ["An option nobody picks", "neutral"],
};

/** Scores grouped into ten bands of the maximum. One series, one colour, with a tooltip on each bar. */
function Histogram({ scores, max }: { scores: number[]; max: number }) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ from: (max * i) / 10, to: (max * (i + 1)) / 10, n: 0 }));
  scores.forEach((s) => { bins[Math.min(9, Math.floor((s / max) * 10))].n++; });
  const top = Math.max(1, ...bins.map((b) => b.n));
  return (
    <figure aria-label="Score distribution">
      <div className="flex h-40 items-end gap-[2px]">
        {bins.map((b, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end" tabIndex={0} aria-label={`${num(b.from)} to ${num(b.to)}: ${b.n} students`}>
            <div className="w-full rounded-t-[4px] bg-brand-2 transition group-hover:bg-brand" style={{ height: `${(b.n / top) * 100}%`, minHeight: b.n ? 3 : 0 }} />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block group-focus:block">{num(b.from)}–{num(b.to)}: {b.n}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>0</span><span>{max / 2}</span><span>{max}</span></div>
    </figure>
  );
}

function Bar({ v, tone = "bg-brand-2", label }: { v: number | null; tone?: string; label: string }) {
  if (v === null) return <span className="text-muted">—</span>;
  return (
    <div className="flex items-center gap-2" aria-label={label}>
      <div className="relative h-2 w-24 rounded-full bg-panel-2"><div className={`absolute top-0 h-full rounded-full ${tone}`} style={{ left: v < 0 ? `${50 + v * 50}%` : tone === "bg-brand-2" ? 0 : "50%", width: `${Math.abs(v) * (tone === "bg-brand-2" ? 100 : 50)}%` }} />{tone !== "bg-brand-2" && <span className="absolute top-[-2px] left-1/2 h-3 w-px bg-muted/50" />}</div>
      <span className="tnum w-10 text-xs font-semibold">{num(v, 2)}</span>
    </div>
  );
}

function ItemRow({ it }: { it: Item }) {
  const [open, setOpen] = useState(it.flags.includes("negative_discrimination"));
  const total = (it.options ?? []).reduce((s, o) => s + o.chosen, 0) + (it.blank ?? 0);
  return (
    <>
      <tr className="cursor-pointer border-b border-line hover:bg-panel-2" onClick={() => setOpen(!open)} aria-expanded={open}>
        <td className="px-4 py-3 align-top font-bold">{it.position}</td>
        <td className="px-3 py-3 align-top"><p className="line-clamp-2 max-w-md">{it.body}</p><div className="mt-1 flex flex-wrap gap-1">{it.flags.map((f) => <Badge key={f} tone={FLAG[f][1]}>{f === "negative_discrimination" && <AlertTriangle size={12} />}{FLAG[f][0]}</Badge>)}</div></td>
        <td className="px-3 py-3 align-top"><Bar v={it.difficulty} label={`Difficulty ${it.difficulty}`} /></td>
        <td className="px-3 py-3 align-top"><Bar v={it.discrimination} tone={it.discrimination !== null && it.discrimination < 0 ? "bg-bad" : "bg-good"} label={`Discrimination ${it.discrimination}`} /></td>
        <td className="px-4 py-3 text-right align-top">{it.type === "mcq" && <ChevronDown size={16} className={`inline transition ${open ? "rotate-180" : ""}`} />}</td>
      </tr>
      {open && it.options && (
        <tr className="border-b border-line bg-panel-2/50"><td /><td colSpan={4} className="px-3 pb-4">
          <ul className="space-y-1.5 text-sm">{it.options.map((o, i) => (
            <li key={o.id} className="flex items-center gap-3">
              <span className="w-5 font-bold text-muted">{"ABCDE"[i]}</span>
              <span className={`w-64 truncate ${o.is_correct ? "font-bold text-good" : ""}`}>{o.body}{o.is_correct && " ✓ key"}</span>
              <div className="h-2 w-40 rounded-full bg-panel"><div className={`h-full rounded-full ${o.is_correct ? "bg-good" : "bg-muted/50"}`} style={{ width: `${total ? (o.chosen / total) * 100 : 0}%` }} /></div>
              <span className="tnum text-xs text-muted">{o.chosen}</span>
            </li>))}
            {(it.blank ?? 0) > 0 && <li className="pl-8 text-xs text-muted">{it.blank} left it blank</li>}
          </ul>
        </td></tr>
      )}
    </>
  );
}

export default function Results({ id }: { id: number }) {
  const [r, setR] = useState<R | null>(null);
  useEffect(() => { api.teacher.results(id).then(setR); }, [id]);
  if (!r) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  const s = r.analysis.summary;
  const done = r.attempts.filter((a) => a.status !== "in_progress");
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">{r.exam.title}</h1><p className="mt-1 text-muted">{r.exam.subject} · {r.analysis.attempts} submitted</p></div>
        <a href={`/api/teacher/exams/${id}/results.csv`} className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-bold hover:bg-panel-2"><Download size={16} /> Download CSV</a>
      </div>
      {!s ? <p className="mt-8 text-muted">No one has submitted yet.</p> : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div className="grid grid-cols-2 gap-3" data-testid="summary">
              {([["Average", s.mean], ["Median", s.median], ["Lowest", s.min], ["Highest", s.max]] as const).map(([l, v]) => (
                <div key={l} className="shadow-soft rounded-2xl bg-panel p-4"><p className="text-sm text-muted">{l}</p><p className="tnum text-3xl font-extrabold">{num(v)}<span className="text-base font-semibold text-muted"> / {s.max_score}</span></p></div>
              ))}
            </div>
            <section className="shadow-soft rounded-2xl bg-panel p-5"><h2 className="font-bold">How the class scored</h2><p className="mb-4 text-sm text-muted">Number of students per score band</p><Histogram scores={done.map((a) => a.score ?? 0)} max={s.max_score} /></section>
          </div>
          <section className="shadow-soft mt-6 overflow-x-auto rounded-2xl bg-panel">
            <div className="px-5 pt-5"><h2 className="font-bold">Item analysis</h2><p className="text-sm text-muted">Difficulty is the share of students who got it right. Discrimination compares the top and bottom 27% of the class: near 0 or below means the question does not tell strong students from weak ones.</p></div>
            <table className="mt-4 w-full min-w-[760px] text-sm" aria-label="Item analysis">
              <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-4 py-2 font-semibold">#</th><th className="px-3 font-semibold">Question</th><th className="px-3 font-semibold">Difficulty</th><th className="px-3 font-semibold">Discrimination</th><th /></tr></thead>
              <tbody>{r.analysis.items.map((it) => <Fragment key={it.id}><ItemRow it={it} /></Fragment>)}</tbody>
            </table>
          </section>
        </>
      )}
      <section className="shadow-soft mt-6 overflow-x-auto rounded-2xl bg-panel">
        <h2 className="px-5 pt-5 font-bold">Students</h2>
        <table className="mt-3 w-full min-w-[640px] text-sm" aria-label="Scores">
          <thead className="text-left text-xs text-muted"><tr className="border-b border-line"><th className="px-5 py-2 font-semibold">Name</th><th className="px-3 font-semibold">Class</th><th className="px-3 font-semibold">Submitted</th><th className="px-3 font-semibold">Left the tab</th><th className="px-5 text-right font-semibold">Score</th></tr></thead>
          <tbody>{r.attempts.map((a) => (
            <tr key={a.id} className="border-b border-line last:border-0">
              <td className="px-5 py-2.5 font-semibold">{a.student}<span className="ml-2 text-xs font-normal text-muted">{a.number}</span></td><td className="px-3 text-muted">{a.class}</td>
              <td className="px-3 text-muted">{a.submitted_at ? dateTime(a.submitted_at) : "working"}{a.auto_submitted && <Badge>time ran out</Badge>}</td>
              <td className="px-3">{a.tab_switches > 0 ? <Badge tone="warn">{a.tab_switches}×</Badge> : <span className="text-muted">0</span>}</td>
              <td className="tnum px-5 text-right font-bold">{a.status === "graded" ? `${num(a.score ?? 0)} / ${a.max_score}` : a.status === "submitted" ? <Badge tone="warn">marking</Badge> : "—"}</td>
            </tr>))}</tbody>
        </table>
      </section>
    </div>
  );
}
