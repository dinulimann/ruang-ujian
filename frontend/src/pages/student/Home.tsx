import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, FileText, Hourglass, PlayCircle } from "lucide-react";
import { api, ApiError, type StudentExam } from "../../lib/api";
import { dateTime, num } from "../../lib/format";
import { go } from "../../lib/router";
import { useSession } from "../../lib/session";
import { Badge, Button, Field, input, Modal, Spinner } from "../../components/ui";

export default function StudentHome() {
  const { me, toast } = useSession();
  const [data, setData] = useState<{ server_now: string; exams: StudentExam[] } | null>(null);
  const [starting, setStarting] = useState<StudentExam | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { api.student.exams().then(setData); }, []);
  if (!data) return <div className="py-32 text-center"><Spinner className="text-brand" /></div>;
  const now = new Date(data.server_now).getTime();
  const open = data.exams.filter((e) => new Date(e.opens_at).getTime() <= now && now < new Date(e.closes_at).getTime() && (!e.attempt || e.attempt.status === "in_progress"));
  const upcoming = data.exams.filter((e) => new Date(e.opens_at).getTime() > now);
  const done = data.exams.filter((e) => e.attempt && e.attempt.status !== "in_progress" || (!e.attempt && new Date(e.closes_at).getTime() <= now));

  const start = async () => {
    if (!starting) return;
    setError("");
    try { const r = await api.student.start(starting.id, token); go(`/exam/${r.attempt_id}`); }
    catch (e) { const err = e as ApiError; setError(err.message); if (err.code !== "wrong_token") toast(err.message, "bad"); }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold">Hi, {me?.name.split(" ")[0]}</h1>
      <p className="mt-1 text-muted">{me?.class} · NIS {me?.number}</p>

      <section className="mt-8" aria-labelledby="open-h">
        <h2 id="open-h" className="flex items-center gap-2 text-lg font-bold"><PlayCircle size={20} className="text-brand" /> Open now</h2>
        {open.length === 0 ? <p className="mt-3 text-sm text-muted">No exam is open for your class right now.</p> : (
          <ul className="mt-3 space-y-3">{open.map((e) => (
            <li key={e.id} className="shadow-soft flex flex-wrap items-center gap-4 rounded-2xl border-l-4 border-brand bg-panel p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand">{e.subject}</p>
                <p className="text-lg font-bold">{e.title}</p>
                <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted"><span className="flex items-center gap-1"><FileText size={14} /> {e.questions} questions</span><span className="flex items-center gap-1"><Clock size={14} /> {e.duration_minutes} minutes</span><span>closes {dateTime(e.closes_at)}</span></p>
              </div>
              {e.attempt ? <Button onClick={() => go(`/exam/${e.attempt!.id}`)}>Continue</Button> : <Button onClick={() => { setStarting(e); setToken(""); setError(""); }}>Start</Button>}
            </li>
          ))}</ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mt-10" aria-labelledby="up-h">
          <h2 id="up-h" className="flex items-center gap-2 text-lg font-bold"><CalendarClock size={20} className="text-muted" /> Coming up</h2>
          <ul className="mt-3 space-y-2">{upcoming.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-panel px-5 py-4"><span><b>{e.title}</b><span className="block text-sm text-muted">{e.subject} · {e.duration_minutes} min</span></span><span className="text-right text-sm text-muted">opens<br /><b className="text-fg">{dateTime(e.opens_at)}</b></span></li>
          ))}</ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="mt-10" aria-labelledby="done-h">
          <h2 id="done-h" className="flex items-center gap-2 text-lg font-bold"><CheckCircle2 size={20} className="text-good" /> Finished</h2>
          <ul className="mt-3 space-y-2">{done.map((e) => (
            <li key={e.id}>
              <a href={e.attempt ? `#/result/${e.attempt.id}` : undefined} className="flex items-center justify-between gap-3 rounded-2xl bg-panel px-5 py-4 hover:bg-panel-2">
                <span><b>{e.title}</b><span className="block text-sm text-muted">{e.subject} · closed {dateTime(e.closes_at)}</span></span>
                {!e.attempt ? <Badge>Not taken</Badge> : e.attempt.score !== null ? <span className="tnum text-right text-lg font-extrabold">{num(e.attempt.score)}<span className="text-sm font-semibold text-muted"> / {e.attempt.max_score}</span></span>
                  : <Badge tone="warn"><Hourglass size={12} /> Being marked</Badge>}
              </a>
            </li>
          ))}</ul>
        </section>
      )}

      <Modal open={!!starting} onClose={() => setStarting(null)} title={starting?.title ?? ""}>
        <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); start(); }}>
          <ul className="space-y-1 rounded-xl bg-panel-2 p-4 text-sm">
            <li>• {starting?.questions} questions, <b>{starting?.duration_minutes} minutes</b>. The timer starts now and keeps running if you close the page.</li>
            <li>• Answers save as you go. Mark a question <b>Unsure</b> to come back to it.</li>
            <li>• Stay on this tab. Leaving it is recorded for your teacher.</li>
            <li>• Use one device. To switch, ask your teacher to release the exam.</li>
          </ul>
          <Field label="Exam token" error={error} hint="Your proctor gives it out at the start.">
            <input data-autofocus value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} maxLength={6} autoComplete="off" className={`${input(error)} text-center font-mono text-2xl tracking-[0.4em] uppercase`} aria-label="Exam token" />
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={token.length < 6}>Start the exam</Button>
        </form>
      </Modal>
    </div>
  );
}
