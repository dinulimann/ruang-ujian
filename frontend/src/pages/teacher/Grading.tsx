import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/session";
import { Badge, Button, Spinner } from "../../components/ui";

type Group = Awaited<ReturnType<typeof api.teacher.essays>>[number];

function AnswerCard({ a, max, onSaved }: { a: Group["answers"][number]; max: number; onSaved: () => void }) {
  const { toast } = useSession();
  const [points, setPoints] = useState(a.points_awarded ?? 0);
  const [feedback, setFeedback] = useState(a.feedback ?? "");
  const save = async () => { try { await api.teacher.grade(a.id, points, feedback); toast(`${a.student}: ${points}/${max}`); onSaved(); } catch (e) { toast((e as ApiError).message, "bad"); } };
  return (
    <li className="shadow-soft rounded-2xl bg-panel p-5" aria-label={`Answer by ${a.student}`}>
      <div className="flex items-center justify-between"><p className="font-bold">{a.student}</p>{a.points_awarded !== null && <Badge tone="good"><CheckCircle2 size={12} /> {a.points_awarded}/{max}</Badge>}</div>
      <p className="mt-2 rounded-xl bg-panel-2 p-4 text-[15px] leading-relaxed whitespace-pre-wrap">{a.essay}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Points">
          {Array.from({ length: max * 2 + 1 }, (_, i) => i / 2).filter((v) => max <= 5 || Number.isInteger(v)).map((v) => (
            <button key={v} role="radio" aria-checked={points === v} onClick={() => setPoints(v)} className={`tnum h-9 min-w-9 rounded-lg px-2 text-sm font-bold ${points === v ? "bg-brand text-white" : "bg-panel-2 text-muted hover:text-fg"}`}>{v}</button>
          ))}
        </div>
        <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback (optional)" aria-label="Feedback" className="h-9 min-w-48 flex-1 rounded-lg border border-line px-3 text-sm" />
        <Button size="sm" onClick={save}>Save mark</Button>
      </div>
    </li>
  );
}

export default function Grading({ id }: { id: number }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [all, setAll] = useState(false);
  const load = () => api.teacher.essays(id, all).then(setGroups);
  useEffect(() => { load(); }, [id, all]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!groups) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  const waiting = groups.reduce((s, g) => s + g.answers.filter((a) => a.points_awarded === null).length, 0);
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">Mark essays</h1><p className="mt-1 text-muted">{waiting ? `${waiting} answer${waiting > 1 ? "s" : ""} waiting` : "Everything is marked."} Multiple choice is marked automatically.</p></div>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Show marked answers too</label>
      </div>
      {groups.map((g) => (
        <section key={g.question.id} className="mt-8">
          <h2 className="font-bold">Question {g.question.position} <span className="font-normal text-muted">· {g.question.points} points</span></h2>
          <p className="mt-1 text-muted">{g.question.body}</p>
          {g.answers.length === 0 ? <p className="mt-3 text-sm text-good">Nothing waiting for this question.</p> : (
            <ul className="mt-3 space-y-3">{g.answers.map((a) => <AnswerCard key={a.id} a={a} max={g.question.points} onSaved={load} />)}</ul>
          )}
        </section>
      ))}
    </div>
  );
}
