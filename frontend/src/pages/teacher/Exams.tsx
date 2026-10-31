import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, Pencil, Plus, Radio } from "lucide-react";
import { api, type Exam } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { Badge, Button, Spinner } from "../../components/ui";

export function examState(e: Exam, now = Date.now()) {
  const o = new Date(e.opens_at).getTime(), c = new Date(e.closes_at).getTime();
  return now < o ? "upcoming" : now < c ? "open" : "closed";
}

export default function Exams() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  useEffect(() => { api.teacher.exams().then(setExams); }, []);
  if (!exams) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">Exams</h1><p className="mt-1 text-muted">Schedule, watch live, mark essays and read the results.</p></div>
        <Button onClick={() => { location.hash = "/teacher/exams/new"; }}><Plus size={18} /> New exam</Button>
      </div>
      <ul className="mt-6 space-y-3">
        {exams.map((e) => {
          const s = examState(e);
          return (
            <li key={e.id} className="shadow-soft flex flex-wrap items-center gap-4 rounded-2xl bg-panel p-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {s === "open" ? <Badge tone="good"><Radio size={12} /> Open now</Badge> : s === "upcoming" ? <Badge tone="brand">Upcoming</Badge> : <Badge>Closed</Badge>}
                  <span className="text-sm text-muted">{e.subject} · {e.class_groups.map((c) => c.name).join(", ")}</span>
                </div>
                <p className="mt-1 text-lg font-bold">{e.title}</p>
                <p className="text-sm text-muted">{dateTime(e.opens_at)} – {dateTime(e.closes_at)} · {e.duration_minutes} min · {e.questions as number} questions{s !== "closed" && <> · token <b className="font-mono text-fg">{e.token}</b></>}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="tnum text-muted">{e.submitted}/{e.started} submitted</span>
                {(e.to_grade ?? 0) > 0 && <a href={`#/teacher/exams/${e.id}/grading`}><Badge tone="warn">{e.to_grade} essay{e.to_grade! > 1 ? "s" : ""} to mark</Badge></a>}
                <a href={`#/teacher/exams/${e.id}/monitor`} className="rounded-xl border border-line px-3 py-2 font-bold hover:bg-panel-2"><Radio size={15} className="mr-1 inline" />Monitor</a>
                <a href={`#/teacher/exams/${e.id}/grading`} className="rounded-xl border border-line px-3 py-2 font-bold hover:bg-panel-2"><ClipboardCheck size={15} className="mr-1 inline" />Mark</a>
                <a href={`#/teacher/exams/${e.id}/results`} className="rounded-xl border border-line px-3 py-2 font-bold hover:bg-panel-2"><BarChart3 size={15} className="mr-1 inline" />Results</a>
                {!e.started && <a href={`#/teacher/exams/${e.id}/edit`} aria-label={`Edit ${e.title}`} className="rounded-xl px-2 py-2 text-muted hover:bg-panel-2"><Pencil size={16} /></a>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
