import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Hourglass, XCircle } from "lucide-react";
import { api, type Result as R } from "../../lib/api";
import { dateTime, num } from "../../lib/format";
import { Button, Spinner } from "../../components/ui";

export default function Result({ attemptId }: { attemptId: number }) {
  const [r, setR] = useState<R | null>(null);
  useEffect(() => { api.student.result(attemptId).then(setR); }, [attemptId]);
  if (!r) return <div className="py-32 text-center"><Spinner className="text-brand" /></div>;
  const pct = r.score !== undefined && r.max_score ? r.score / r.max_score : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="shadow-soft rounded-2xl bg-panel p-8 text-center">
        <p className="text-sm font-semibold text-brand">{r.exam.subject}</p>
        <h1 className="text-2xl font-extrabold">{r.exam.title}</h1>
        <p className="mt-1 text-sm text-muted">Submitted {dateTime(r.submitted_at)}{r.auto_submitted ? " · automatically, when time ran out" : ""}</p>
        {pct !== null ? (
          <div className="mt-6" data-testid="score">
            <p className="tnum text-6xl font-extrabold">{num(r.score!)}<span className="text-2xl text-muted"> / {r.max_score}</span></p>
            <div className="mx-auto mt-4 h-3 max-w-sm overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-brand" style={{ width: `${pct * 100}%` }} /></div>
          </div>
        ) : !r.show_results ? (
          <p className="mt-6 flex items-center justify-center gap-2 font-semibold text-muted"><CheckCircle2 className="text-good" /> Submitted. Your teacher will share the results.</p>
        ) : (
          <p className="mt-6 flex items-center justify-center gap-2 font-semibold text-warn" data-testid="pending"><Hourglass /> Your essays are being marked. Check back later.</p>
        )}
        {r.review === null && r.review_from && <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted"><Clock size={14} /> The answers can be reviewed after the exam closes at {dateTime(r.review_from)}.</p>}
        <Button variant="secondary" className="mt-6" onClick={() => { location.hash = "/"; }}>Back to my exams</Button>
      </div>
      {r.review && (
        <ol className="mt-6 space-y-3">
          {r.review.map((q) => (
            <li key={q.number} className="shadow-soft rounded-2xl bg-panel p-5">
              <div className="flex items-start justify-between gap-3"><p className="prose-q"><b>{q.number}.</b> {q.body}</p><span className="tnum shrink-0 text-sm font-bold">{num(q.awarded ?? 0)}/{q.points}</span></div>
              {q.type === "mcq" ? (
                <ul className="mt-3 space-y-1 text-sm">{q.options.map((o) => (
                  <li key={o.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${o.id === q.correct ? "bg-good-soft font-semibold text-good" : o.id === q.chosen ? "bg-bad-soft text-bad" : ""}`}>
                    {o.id === q.correct ? <CheckCircle2 size={15} /> : o.id === q.chosen ? <XCircle size={15} /> : <span className="w-[15px]" />}{o.body}
                    {o.id === q.chosen && <span className="ml-auto text-xs">your answer</span>}
                  </li>))}</ul>
              ) : (
                <div className="mt-3 text-sm"><p className="rounded-lg bg-panel-2 p-3 whitespace-pre-wrap">{q.essay || <i className="text-muted">No answer</i>}</p>{q.feedback && <p className="mt-2 text-brand">Teacher: {q.feedback}</p>}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
