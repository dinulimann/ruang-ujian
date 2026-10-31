import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileUp, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, ApiError, type Meta, type Question } from "../../lib/api";
import { useSession } from "../../lib/session";
import { Badge, Button, Empty, Field, input, Modal, Spinner } from "../../components/ui";

function Editor({ meta, q, onClose, onSaved }: { meta: Meta; q: Question | "new"; onClose: () => void; onSaved: () => void }) {
  const { toast } = useSession();
  const init = q === "new" ? null : q;
  const [f, setF] = useState({ subject_id: init?.subject_id ?? meta.subjects[0]?.id, type: init?.type ?? "mcq", body: init?.body ?? "", points: init?.points ?? 2,
    options: init?.options.length ? init.options.map((o) => ({ body: o.body, is_correct: !!o.is_correct })) : [0, 1, 2, 3].map((i) => ({ body: "", is_correct: i === 0 })) });
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const save = async () => {
    const fd = new FormData();
    fd.append("subject_id", String(f.subject_id)); fd.append("type", f.type); fd.append("body", f.body); fd.append("points", String(f.points));
    if (f.type === "mcq") f.options.forEach((o, i) => { fd.append(`options[${i}][body]`, o.body); fd.append(`options[${i}][is_correct]`, o.is_correct ? "1" : "0"); });
    if (image) fd.append("image", image);
    if (removeImage) fd.append("remove_image", "1");
    try { await api.teacher.saveQuestion(init?.id ?? null, fd); toast("Question saved"); onSaved(); }
    catch (e) { const err = e as ApiError; setErrors(err.errors); toast(err.message, "bad"); }
  };
  const err = (k: string) => errors[k]?.[0];
  const preview = image ? URL.createObjectURL(image) : !removeImage ? init?.image_url : null;
  return (
    <Modal open onClose={onClose} title={init ? "Edit question" : "New question"} width="max-w-2xl">
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Subject"><select value={f.subject_id} onChange={(e) => setF({ ...f, subject_id: Number(e.target.value) })} className={input()}>{meta.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "mcq" | "essay" })} className={input()}><option value="mcq">Multiple choice</option><option value="essay">Essay</option></select></Field>
          <Field label="Points" error={err("points")}><input type="number" min={1} max={100} value={f.points} onChange={(e) => setF({ ...f, points: Number(e.target.value) })} className={input(err("points"))} /></Field>
        </div>
        <Field label="Question" error={err("body")}><textarea data-autofocus value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={4} className={`${input(err("body"))} h-auto py-3`} /></Field>
        <div className="flex items-center gap-3">
          {preview && <img src={preview} alt="" className="h-20 rounded-lg border border-line object-contain" />}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-bold hover:bg-panel-2"><ImagePlus size={16} /> {preview ? "Change picture" : "Add a picture"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { setImage(e.target.files?.[0] ?? null); setRemoveImage(false); }} /></label>
          {preview && <button onClick={() => { setImage(null); setRemoveImage(true); }} className="text-sm font-semibold text-bad">Remove</button>}
          {err("image") && <span className="text-xs text-bad">{err("image")}</span>}
        </div>
        {f.type === "mcq" && (
          <fieldset><legend className="text-sm font-bold">Options <span className="font-normal text-muted">(choose the right one)</span></legend>
            <div className="mt-2 space-y-2">{f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correct" checked={o.is_correct} onChange={() => setF({ ...f, options: f.options.map((x, j) => ({ ...x, is_correct: j === i })) })} aria-label={`Option ${"ABCDE"[i]} is correct`} className="size-5 accent-[var(--brand)]" />
                <span className="w-5 text-sm font-bold text-muted">{"ABCDE"[i]}</span>
                <input value={o.body} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} aria-label={`Option ${"ABCDE"[i]}`} className={input(err(`options.${i}.body`))} />
                {f.options.length > 2 && <button onClick={() => setF({ ...f, options: f.options.filter((_, j) => j !== i).map((x, j) => (o.is_correct && j === 0 ? { ...x, is_correct: true } : x)) })} aria-label="Remove option" className="text-muted hover:text-bad"><X size={18} /></button>}
              </div>
            ))}</div>
            {f.options.length < 5 && <button onClick={() => setF({ ...f, options: [...f.options, { body: "", is_correct: false }] })} className="mt-2 text-sm font-bold text-brand">+ Add option</button>}
            {err("options") && <p className="mt-1 text-xs font-semibold text-bad">{err("options")}</p>}
          </fieldset>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </div>
    </Modal>
  );
}

function Import({ meta, onClose, onDone }: { meta: Meta; onClose: () => void; onDone: () => void }) {
  const { toast } = useSession();
  const [subject, setSubject] = useState(meta.subjects[0]?.id);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<{ valid: number; preview?: Record<string, string>[] } | null>(null);
  const [problems, setProblems] = useState<{ row: number; message: string }[]>([]);
  const send = async (dry: boolean) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("subject_id", String(subject)); if (dry) fd.append("dry_run", "1");
    try {
      const r = await api.teacher.importQuestions(fd);
      if (dry) { setCheck({ valid: r.valid!, preview: r.preview }); setProblems([]); }
      else { toast(`${r.imported} questions imported`); onDone(); }
    } catch (e) { const err = e as ApiError; setProblems((err.details as { row: number; message: string }[]) ?? []); setCheck(null); toast(err.message, "bad"); }
  };
  return (
    <Modal open onClose={onClose} title="Import questions" width="max-w-2xl">
      <div className="space-y-4 p-5">
        <p className="text-sm text-muted">One question per row, in a CSV or Excel file with the columns <code className="rounded bg-panel-2 px-1">type, question, a–e, answer, points</code>. The file is checked first; if any row is wrong, nothing is imported.</p>
        <a href="/api/teacher/questions/template" className="inline-flex items-center gap-2 text-sm font-bold text-brand"><Download size={16} /> Download the template</a>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject"><select value={subject} onChange={(e) => setSubject(Number(e.target.value))} className={input()}>{meta.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="File"><input type="file" accept=".csv,.xlsx" aria-label="Question file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setCheck(null); setProblems([]); }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:font-bold file:text-brand" /></Field>
        </div>
        {problems.length > 0 && (
          <div className="rounded-xl bg-bad-soft p-4 text-sm text-bad" role="alert"><p className="font-bold">Fix these rows and upload again:</p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{problems.map((p, i) => <li key={i}><b>Row {p.row}:</b> {p.message}</li>)}</ul></div>
        )}
        {check && (
          <div className="rounded-xl bg-good-soft p-4 text-sm" data-testid="import-check"><p className="font-bold text-good">{check.valid} questions ready to import.</p>
            <ul className="mt-2 space-y-1 text-fg">{check.preview?.map((r, i) => <li key={i} className="truncate">• <Badge>{r.type}</Badge> {r.question}</li>)}</ul></div>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" disabled={!file} onClick={() => send(true)}>Check file</Button>
          <Button disabled={!check} onClick={() => send(false)}><FileUp size={16} /> Import {check?.valid ?? ""}</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function Questions() {
  const { toast } = useSession();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState<{ data: Question[]; total: number; page: number; last_page: number } | null>(null);
  const [filter, setFilter] = useState({ subject_id: 0, type: "", q: "", page: 1 });
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const timer = useRef(0);
  const load = useCallback(() => api.teacher.questions(filter).then(setPage), [filter]);
  useEffect(() => { api.teacher.meta().then(setMeta); }, []);
  useEffect(() => { clearTimeout(timer.current); timer.current = window.setTimeout(load, 250); }, [load]);
  if (!meta) return <div className="py-24 text-center"><Spinner className="text-brand" /></div>;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">Question bank</h1><p className="mt-1 text-muted">{page ? `${page.total} questions` : " "}. Exams keep their own copy, so editing here never changes a test students already took.</p></div>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => setImporting(true)}><FileUp size={17} /> Import</Button><Button onClick={() => setEditing("new")}><Plus size={17} /> New question</Button></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <label className="relative w-full sm:w-72"><Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" /><input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value, page: 1 })} placeholder="Search questions" aria-label="Search questions" className={`${input()} pl-9`} /></label>
        <select value={filter.subject_id} onChange={(e) => setFilter({ ...filter, subject_id: Number(e.target.value), page: 1 })} aria-label="Subject" className={`${input()} w-auto`}><option value={0}>All subjects</option>{meta.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value, page: 1 })} aria-label="Type" className={`${input()} w-auto`}><option value="">All types</option><option value="mcq">Multiple choice</option><option value="essay">Essay</option></select>
      </div>
      {!page ? <div className="py-16 text-center"><Spinner className="text-brand" /></div> : page.data.length === 0 ? <div className="mt-6"><Empty title="No questions here">Write one, or import a spreadsheet.</Empty></div> : (
        <ul className="mt-5 space-y-2" aria-label="Questions">{page.data.map((q) => (
          <li key={q.id} className="shadow-soft flex gap-4 rounded-2xl bg-panel p-4">
            {q.image_url && <img src={q.image_url} alt="" className="size-16 shrink-0 rounded-lg border border-line object-contain" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs"><Badge tone={q.type === "mcq" ? "brand" : "warn"}>{q.type === "mcq" ? "Multiple choice" : "Essay"}</Badge><span className="text-muted">{q.subject} · {q.points} pts · #{q.id}</span></div>
              <p className="mt-1.5 line-clamp-2">{q.body}</p>
              {q.type === "mcq" && <p className="mt-1 truncate text-sm text-good">✓ {q.options.find((o) => o.is_correct)?.body}</p>}
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <button onClick={() => setEditing(q)} aria-label="Edit" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-panel-2"><Pencil size={16} /></button>
              <button onClick={async () => { if (!confirm("Delete this question from the bank?")) return; await api.teacher.deleteQuestion(q.id); toast("Question deleted"); load(); }} aria-label="Delete" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-bad-soft hover:text-bad"><Trash2 size={16} /></button>
            </div>
          </li>
        ))}</ul>
      )}
      {page && page.last_page > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm"><Button variant="secondary" size="sm" disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Previous</Button><span className="tnum">{page.page} / {page.last_page}</span><Button variant="secondary" size="sm" disabled={filter.page >= page.last_page} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Button></div>
      )}
      {editing && <Editor meta={meta} q={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {importing && <Import meta={meta} onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
    </div>
  );
}
