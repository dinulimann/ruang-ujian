import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, X } from "lucide-react";
import { api, ApiError, type Meta, type Question } from "../../lib/api";
import { fromLocalInput, toLocalInput } from "../../lib/format";
import { useSession } from "../../lib/session";
import { Badge, Button, Field, input, Spinner } from "../../components/ui";

export default function ExamEditor({ id }: { id: number | null }) {
  const { toast } = useSession();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [bank, setBank] = useState<Question[]>([]);
  const [token, setToken] = useState("");
  const start = new Date(Date.now() + 24 * 3600_000); start.setUTCHours(1, 0, 0, 0);
  const [f, setF] = useState({ title: "", subject_id: 0, class_group_ids: [] as number[], opens_at: toLocalInput(start.toISOString()), closes_at: toLocalInput(new Date(start.getTime() + 2 * 3600_000).toISOString()),
    duration_minutes: 60, shuffle_questions: true, shuffle_options: true, show_results: true, question_ids: [] as number[] });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  useEffect(() => {
    api.teacher.meta().then((m) => { setMeta(m); setF((x) => ({ ...x, subject_id: x.subject_id || m.subjects[0]?.id })); });
    api.teacher.questions({ per_page: 100 }).then((p) => setBank(p.data));
    if (id) api.teacher.exam(id).then((e) => {
      setToken(e.token);
      setF({ title: e.title, subject_id: e.subject_id, class_group_ids: e.class_groups.map((c) => c.id), opens_at: toLocalInput(e.opens_at), closes_at: toLocalInput(e.closes_at),
        duration_minutes: e.duration_minutes, shuffle_questions: e.shuffle_questions, shuffle_options: e.shuffle_options, show_results: e.show_results,
        question_ids: (e.questions as { question_id: number }[]).map((q) => q.question_id) });
    });
  }, [id]);
  const chosen = useMemo(() => f.question_ids.map((qid) => bank.find((q) => q.id === qid)).filter(Boolean) as Question[], [f.question_ids, bank]);
  const available = bank.filter((q) => q.subject_id === f.subject_id && !f.question_ids.includes(q.id));
  const move = (i: number, d: number) => { const ids = [...f.question_ids]; [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; setF({ ...f, question_ids: ids }); };
  const save = async () => {
    setErrors({});
    try {
      const e = await api.teacher.saveExam(id, { ...f, opens_at: fromLocalInput(f.opens_at), closes_at: fromLocalInput(f.closes_at) });
      toast(id ? "Exam updated" : `Exam scheduled. Token ${e.token}`); location.hash = "/teacher";
    } catch (e) { const err = e as ApiError; setErrors(err.errors); toast(err.message, "bad"); }
  };
  if (!meta) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  const err = (k: string) => errors[k]?.[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <h1 className="text-3xl font-extrabold">{id ? "Edit exam" : "New exam"}</h1>
        <section className="shadow-soft space-y-4 rounded-2xl bg-panel p-5">
          <Field label="Title" error={err("title")}><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={input(err("title"))} placeholder="Ulangan Harian: Sistem Pencernaan" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject"><select value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: Number(e.target.value), question_ids: [] })} className={input()}>{meta.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Duration (minutes)" error={err("duration_minutes")}><input type="number" min={1} max={600} value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value) })} className={input(err("duration_minutes"))} /></Field>
            <Field label="Opens (WIB)" error={err("opens_at")}><input type="datetime-local" value={f.opens_at} onChange={(e) => setF({ ...f, opens_at: e.target.value })} className={input(err("opens_at"))} /></Field>
            <Field label="Closes (WIB)" error={err("closes_at")} hint="Students who start late still have to finish by then."><input type="datetime-local" value={f.closes_at} onChange={(e) => setF({ ...f, closes_at: e.target.value })} className={input(err("closes_at"))} /></Field>
          </div>
          <fieldset><legend className="text-sm font-bold">Classes</legend>
            <div className="mt-2 flex flex-wrap gap-2">{meta.class_groups.map((c) => { const on = f.class_group_ids.includes(c.id); return (
              <button key={c.id} aria-pressed={on} onClick={() => setF({ ...f, class_group_ids: on ? f.class_group_ids.filter((x) => x !== c.id) : [...f.class_group_ids, c.id] })}
                className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${on ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>{c.name} <span className="font-normal opacity-60">{c.students_count}</span></button>); })}</div>
            {err("class_group_ids") && <p className="mt-1 text-xs text-bad">{err("class_group_ids")}</p>}
          </fieldset>
          <div className="flex flex-wrap gap-5 text-sm">
            {([["shuffle_questions", "Shuffle questions"], ["shuffle_options", "Shuffle options"], ["show_results", "Show scores to students"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} className="size-4 accent-[var(--brand)]" /> {l}</label>
            ))}
          </div>
          {id && token && <p className="flex items-center gap-3 text-sm">Token <b className="font-mono text-lg tracking-widest">{token}</b><button onClick={async () => setToken((await api.teacher.newToken(id)).token)} className="flex items-center gap-1 font-bold text-brand"><RefreshCw size={14} /> New token</button></p>}
        </section>
        <section className="shadow-soft rounded-2xl bg-panel p-5">
          <div className="flex items-center justify-between"><h2 className="font-bold">In this exam</h2><span className="tnum text-sm text-muted">{chosen.length} questions · {chosen.reduce((s, q) => s + q.points, 0)} points</span></div>
          {err("question_ids") && <p className="mt-1 text-xs text-bad">{err("question_ids")}</p>}
          <ol className="mt-3 space-y-1.5">{chosen.map((q, i) => (
            <li key={q.id} className="flex items-center gap-2 rounded-xl bg-panel-2 px-3 py-2 text-sm">
              <span className="tnum w-6 font-bold text-muted">{i + 1}.</span><span className="flex-1 truncate">{q.body}</span><Badge tone={q.type === "mcq" ? "brand" : "warn"}>{q.points}</Badge>
              <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="text-muted disabled:opacity-30"><ArrowUp size={15} /></button>
              <button disabled={i === chosen.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="text-muted disabled:opacity-30"><ArrowDown size={15} /></button>
              <button onClick={() => setF({ ...f, question_ids: f.question_ids.filter((x) => x !== q.id) })} aria-label="Remove" className="text-muted hover:text-bad"><X size={15} /></button>
            </li>))}</ol>
          <div className="mt-5 flex justify-end"><Button size="lg" onClick={save} disabled={!chosen.length}>{id ? "Save changes" : "Schedule exam"}</Button></div>
        </section>
      </div>
      <aside className="shadow-soft h-fit rounded-2xl bg-panel p-5 lg:sticky lg:top-24">
        <div className="flex items-center justify-between"><h2 className="font-bold">From the bank</h2><button onClick={() => setF({ ...f, question_ids: [...f.question_ids, ...available.map((q) => q.id)] })} className="text-sm font-bold text-brand">Add all</button></div>
        <ul className="mt-3 max-h-[70vh] space-y-1.5 overflow-y-auto">{available.map((q) => (
          <li key={q.id}><button onClick={() => setF({ ...f, question_ids: [...f.question_ids, q.id] })} className="flex w-full items-start gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-brand/40">
            <span className="mt-0.5 font-bold text-brand">+</span><span className="line-clamp-2 flex-1">{q.body}</span><Badge tone={q.type === "mcq" ? "brand" : "warn"}>{q.type === "mcq" ? "PG" : "Esai"}</Badge></button></li>
        ))}</ul>
        {available.length === 0 && <p className="text-sm text-muted">Every question for this subject is already in.</p>}
      </aside>
    </div>
  );
}
