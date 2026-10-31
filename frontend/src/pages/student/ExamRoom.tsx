import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CloudOff, Flag, LayoutGrid, Loader2, Maximize, ShieldAlert } from "lucide-react";
import { api, ApiError, type AttemptView, type PaperQuestion } from "../../lib/api";
import { clock } from "../../lib/format";
import { go } from "../../lib/router";
import { useSession } from "../../lib/session";
import { Button, Modal, Spinner } from "../../components/ui";

type Local = PaperQuestion["answer"];
type Save = { option_id?: number | null; essay?: string | null; flagged: boolean; seq: number };
const LETTERS = "ABCDE";

/**
 * The exam screen. The server owns the deadline: the clock here is only the server's time corrected for the
 * difference with this device. Every change is saved with an increasing number; changes made while offline wait
 * in localStorage and are sent when the connection returns, and the server ignores anything older than what it has.
 */
export default function ExamRoom({ attemptId }: { attemptId: number }) {
  const { toast } = useSession();
  const [view, setView] = useState<AttemptView | null>(null);
  const [answers, setAnswers] = useState<Record<number, Local>>({});
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<"saved" | "saving" | "offline">("saved");
  const [blocked, setBlocked] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0); // server time minus device time
  const pendingKey = `ru:pending:${attemptId}`;
  const pending = useRef<Record<number, Save>>({});
  const inFlight = useRef(0);
  const essayTimers = useRef<Record<number, number>>({});
  const finishing = useRef(false);

  const persist = () => { try { localStorage.setItem(pendingKey, JSON.stringify(pending.current)); } catch { /* storage full: keep in memory */ } };

  const finish = useCallback(async (auto: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    await flush();
    try { await api.student.submit(attemptId); } catch { /* already submitted by the server's timer */ }
    try { localStorage.removeItem(pendingKey); } catch { /* ignore */ }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (auto) toast("Time is up. Your answers were submitted.");
    go(`/result/${attemptId}`);
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (qid: number) => {
    const body = pending.current[qid];
    if (!body) return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    inFlight.current++; setStatus("saving");
    try {
      const r = await api.student.save(attemptId, qid, body);
      offset.current = new Date(r.server_now).getTime() - Date.now();
      if (pending.current[qid]?.seq === body.seq) { delete pending.current[qid]; persist(); }
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "time_up") { finish(true); return; }
      if (err.code === "device_mismatch") { setBlocked(err.message); return; }
      if (err.status === 0) setStatus("offline");
      else { delete pending.current[qid]; persist(); toast(err.message, "bad"); }
    } finally {
      inFlight.current--;
      if (inFlight.current === 0) setStatus(Object.keys(pending.current).length ? (navigator.onLine ? "saving" : "offline") : "saved");
    }
  }, [attemptId, finish, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  async function flush() {
    await Promise.all(Object.keys(pending.current).map((q) => send(Number(q))));
  }

  useEffect(() => {
    api.student.attempt(attemptId).then((v) => {
      if (v.status !== "in_progress") { go(`/result/${attemptId}`); return; }
      offset.current = new Date(v.server_now).getTime() - Date.now();
      const a: Record<number, Local> = {};
      v.questions!.forEach((q) => { a[q.id] = q.answer; });
      try { pending.current = JSON.parse(localStorage.getItem(pendingKey) ?? "{}"); } catch { pending.current = {}; }
      // Changes made offline before a reload are newer than what the server has: show them and send them.
      for (const [q, p] of Object.entries(pending.current)) {
        const cur = a[Number(q)];
        if (cur && p.seq > cur.seq) a[Number(q)] = { ...cur, ...p, option_id: p.option_id ?? null, essay: p.essay ?? null };
        else delete pending.current[Number(q)];
      }
      setAnswers(a);
      setView(v);
      flush();
    }).catch((e: ApiError) => { if (e.code === "device_mismatch") setBlocked(e.message); else toast(e.message, "bad"); });
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => {
    const vis = () => { if (document.visibilityState === "hidden") api.student.event(attemptId, "tab_hidden").catch(() => {}); };
    const online = () => { api.student.event(attemptId, "online").catch(() => {}); flush(); };
    const offline = () => setStatus("offline");
    const fs = () => { if (!document.fullscreenElement) api.student.event(attemptId, "fullscreen_exit").catch(() => {}); };
    const leave = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) e.preventDefault(); };
    document.addEventListener("visibilitychange", vis); addEventListener("online", online); addEventListener("offline", offline);
    document.addEventListener("fullscreenchange", fs); addEventListener("beforeunload", leave);
    return () => { document.removeEventListener("visibilitychange", vis); removeEventListener("online", online); removeEventListener("offline", offline); document.removeEventListener("fullscreenchange", fs); removeEventListener("beforeunload", leave); };
  }, [attemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const qs = view?.questions ?? [];
  const q = qs[index];
  const left = view ? new Date(view.deadline_at).getTime() - (now + offset.current) : 0;
  const warned = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!view) return;
    for (const m of [5, 1]) if (left <= m * 60_000 && left > 0 && !warned.current.has(m)) { warned.current.add(m); toast(`${m} minute${m > 1 ? "s" : ""} left.`, "bad"); }
    if (left <= 0) finish(true);
  }, [left <= 0, Math.ceil(left / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (qid: number, patch: Partial<Local>, debounce = false) => {
    const cur = answers[qid];
    const next = { ...cur, ...patch, seq: Math.max(cur.seq, pending.current[qid]?.seq ?? 0) + 1 };
    setAnswers((a) => ({ ...a, [qid]: next }));
    const qq = qs.find((x) => x.id === qid)!;
    pending.current[qid] = qq.type === "mcq" ? { option_id: next.option_id, flagged: next.flagged, seq: next.seq } : { essay: next.essay, flagged: next.flagged, seq: next.seq };
    persist();
    setStatus(navigator.onLine ? "saving" : "offline");
    clearTimeout(essayTimers.current[qid]);
    if (debounce) essayTimers.current[qid] = window.setTimeout(() => send(qid), 700);
    else send(qid);
  };

  const answered = (a?: Local) => !!a && (a.option_id !== null || !!a.essay?.trim());
  const counts = useMemo(() => ({ answered: qs.filter((x) => answered(answers[x.id])).length, flagged: qs.filter((x) => answers[x.id]?.flagged).length }), [qs, answers]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!q || (e.target as HTMLElement).closest("textarea, input") || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = LETTERS.indexOf(e.key.toUpperCase());
      if (q.type === "mcq" && i >= 0 && i < q.options.length) change(q.id, { option_id: q.options[i].id });
      else if (e.key === "ArrowRight") setIndex((n) => Math.min(qs.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setIndex((n) => Math.max(0, n - 1));
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  if (blocked) return (
    <div className="flex min-h-screen items-center justify-center p-6"><div className="max-w-md text-center"><ShieldAlert size={48} className="mx-auto text-bad" /><h1 className="mt-4 text-2xl font-extrabold">Exam locked to another device</h1><p className="mt-2 text-muted">{blocked}</p><p className="mt-2 text-sm text-muted">Once your teacher has released it, this device can take over.</p><div className="mt-6 flex justify-center gap-2"><Button variant="secondary" onClick={() => go("/")}>Back to my exams</Button><Button onClick={() => location.reload()}>Try again</Button></div></div></div>
  );
  if (!view || !q) return <div className="py-32 text-center"><Spinner className="text-brand" /></div>;
  const a = answers[q.id];
  const urgent = left < 60_000 ? "bg-bad text-white" : left < 5 * 60_000 ? "bg-flag-soft text-flag" : "bg-panel-2 text-fg";

  const Navigator = () => (
    <div>
      <div className="grid grid-cols-5 gap-2" role="list" aria-label="Questions">
        {qs.map((x, i) => {
          const s = answers[x.id];
          const cls = s?.flagged ? "bg-flag text-white" : answered(s) ? "bg-brand text-white" : "bg-panel-2 text-muted";
          return <button key={x.id} role="listitem" aria-label={`Question ${i + 1}${s?.flagged ? ", unsure" : answered(s) ? ", answered" : ", not answered"}`} aria-current={i === index}
            onClick={() => { setIndex(i); setNavOpen(false); }} className={`tnum h-11 rounded-xl text-sm font-bold transition ${cls} ${i === index ? "ring-2 ring-fg ring-offset-2" : ""}`}>{i + 1}</button>;
        })}
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-2"><span className="size-3 rounded bg-brand" /> Answered ({counts.answered})</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded bg-flag" /> Unsure ({counts.flagged})</li>
        <li className="flex items-center gap-2"><span className="size-3 rounded bg-panel-2 ring-1 ring-line" /> Not answered ({qs.length - counts.answered})</li>
      </ul>
    </div>
  );

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{view.exam.title}</p><p className="text-xs text-muted">{view.exam.subject}</p></div>
          <span className="hidden items-center gap-1.5 text-xs font-semibold sm:flex" aria-live="polite" data-testid="save-status">
            {status === "saving" ? <><Loader2 size={14} className="animate-spin text-muted" /> Saving…</> : status === "offline" ? <><CloudOff size={14} className="text-bad" /> <span className="text-bad">Offline, will retry</span></> : <><Check size={14} className="text-good" /> Saved</>}
          </span>
          <span className={`tnum rounded-xl px-3 py-2 font-mono text-lg font-bold ${urgent}`} role="timer" aria-label={`Time left ${clock(left)}`} data-testid="timer">{clock(left)}</span>
          {document.fullscreenEnabled && !document.fullscreenElement && <Button variant="ghost" size="sm" onClick={() => document.documentElement.requestFullscreen().catch(() => {})} aria-label="Full screen"><Maximize size={16} /></Button>}
          <Button size="sm" onClick={() => setConfirm(true)}>Finish</Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <main>
          <article className="shadow-soft rounded-2xl bg-panel p-6 sm:p-8" aria-labelledby="qnum">
            <div className="flex items-center justify-between gap-3">
              <p id="qnum" className="text-sm font-bold text-brand">Question {index + 1} of {qs.length}</p>
              <span className="text-xs font-semibold text-muted">{q.points} point{q.points > 1 ? "s" : ""}{q.type === "essay" ? " · essay" : ""}</span>
            </div>
            {q.image_url && <img src={q.image_url} alt="Picture for this question" className="mt-5 max-h-80 rounded-xl border border-line bg-white object-contain" />}
            <p className="prose-q mt-4 text-[17px]">{q.body}</p>
            {q.type === "mcq" ? (
              <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Options">
                {q.options.map((o, i) => {
                  const on = a.option_id === o.id;
                  return (
                    <button key={o.id} role="radio" aria-checked={on} onClick={() => change(q.id, { option_id: on ? null : o.id })}
                      className={`flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left transition ${on ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40"}`}>
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-extrabold ${on ? "bg-brand text-white" : "bg-panel-2 text-muted"}`}>{LETTERS[i]}</span>
                      <span className="pt-1">{o.body}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea value={a.essay ?? ""} onChange={(e) => change(q.id, { essay: e.target.value }, true)} rows={9} maxLength={10000} aria-label="Your answer" placeholder="Type your answer…"
                className="mt-6 w-full rounded-xl border-2 border-line p-4 text-[15px] leading-relaxed outline-none focus:border-brand" />
            )}
          </article>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={17} /> Previous</Button>
            <Button variant={a.flagged ? "flag" : "secondary"} aria-pressed={a.flagged} onClick={() => change(q.id, { flagged: !a.flagged })}><Flag size={16} /> {a.flagged ? "Unsure" : "Mark unsure"}</Button>
            {index < qs.length - 1 ? <Button onClick={() => setIndex(index + 1)}>Next <ArrowRight size={17} /></Button> : <Button onClick={() => setConfirm(true)}>Finish</Button>}
          </div>
          <p className="mt-3 hidden text-center text-xs text-muted sm:block">Keys: A–E to choose, ← → to move between questions.</p>
        </main>
        <aside className="shadow-soft hidden h-fit rounded-2xl bg-panel p-5 lg:sticky lg:top-24 lg:block"><Navigator /></aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel p-3 lg:hidden">
        <Button variant="secondary" className="w-full" onClick={() => setNavOpen(true)}><LayoutGrid size={17} /> Questions · {counts.answered}/{qs.length} answered</Button>
      </div>
      <Modal open={navOpen} onClose={() => setNavOpen(false)} title="Questions"><div className="p-5"><Navigator /></div></Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Finish the exam?">
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-brand-soft p-3"><p className="tnum text-2xl font-extrabold text-brand">{counts.answered}</p><p className="text-xs text-muted">answered</p></div>
            <div className="rounded-xl bg-flag-soft p-3"><p className="tnum text-2xl font-extrabold text-flag">{counts.flagged}</p><p className="text-xs text-muted">unsure</p></div>
            <div className="rounded-xl bg-panel-2 p-3"><p className="tnum text-2xl font-extrabold">{qs.length - counts.answered}</p><p className="text-xs text-muted">blank</p></div>
          </div>
          {(qs.length - counts.answered > 0 || counts.flagged > 0) && <p className="flex gap-2 rounded-xl bg-warn-soft p-3 text-sm text-warn"><AlertTriangle size={18} className="shrink-0" /> You can still go back: {clock(left)} left. Once you finish, you cannot change your answers.</p>}
          {status !== "saved" && <p className="text-sm text-muted">Some answers are still being saved; they will be sent before submitting.</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>Keep working</Button><Button onClick={() => finish(false)}>Finish and submit</Button></div>
        </div>
      </Modal>
    </div>
  );
}
