import { useEffect } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { BookOpen, ClipboardList, LogOut } from "lucide-react";
import { useLoc } from "./lib/router";
import { SessionProvider, useSession } from "./lib/session";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import StudentHome from "./pages/student/Home";
import ExamRoom from "./pages/student/ExamRoom";
import Result from "./pages/student/Result";
import Exams from "./pages/teacher/Exams";
import Questions from "./pages/teacher/Questions";
import ExamEditor from "./pages/teacher/ExamEditor";
import Monitor from "./pages/teacher/Monitor";
import Grading from "./pages/teacher/Grading";
import Results from "./pages/teacher/Results";

function Toasts() {
  const { toasts } = useSession();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" role="status" aria-live="polite">
      <AnimatePresence>{toasts.map((t) => (
        <motion.p key={t.id} layout initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className={`rounded-xl px-4 py-3 text-sm font-bold shadow-xl ${t.tone === "bad" ? "bg-bad text-white" : "bg-fg text-white"}`}>{t.text}</motion.p>
      ))}</AnimatePresence>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, signOut } = useSession();
  const { path } = useLoc();
  const teacher = me?.role === "teacher";
  const nav = teacher ? [["/teacher", "Exams", ClipboardList], ["/teacher/questions", "Question bank", BookOpen]] as const : [];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href={teacher ? "#/teacher" : "#/"} className="flex items-center gap-2.5"><img src="/app/favicon.svg" alt="" className="size-8" /><span className="font-extrabold">Ruang Ujian</span></a>
          <nav className="flex gap-1" aria-label="Main">{nav.map(([to, l, Icon]) => {
            const on = to === "/teacher" ? path[0] === "teacher" && path[1] !== "questions" : path[1] === "questions";
            return <a key={to} href={`#${to}`} aria-current={on ? "page" : undefined} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${on ? "bg-brand-soft text-brand" : "text-muted hover:text-fg"}`}><Icon size={16} />{l}</a>;
          })}</nav>
          <div className="ml-auto flex items-center gap-3 text-sm"><span className="hidden text-right leading-tight sm:block"><b className="block">{me?.name}</b><span className="text-xs text-muted">{teacher ? "Teacher" : `${me?.class} · ${me?.number}`}</span></span>
            <button onClick={signOut} aria-label="Sign out" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-panel-2"><LogOut size={17} /></button></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <p className="pb-8 text-center text-xs text-muted">SMA Contoh Nusantara is fictional. Ruang Ujian is a portfolio project by Dinul Iman.</p>
    </div>
  );
}

function Routes() {
  const { me, loaded } = useSession();
  const { path } = useLoc();
  useEffect(() => { if (loaded && me?.role === "teacher" && path[0] !== "teacher") location.hash = "/teacher"; }, [loaded, me, path]);
  if (!loaded) return <div className="grid min-h-screen place-items-center"><Spinner className="text-brand" /></div>;
  if (!me) return <Login />;
  const [a, b, c, d] = path;
  if (me.role === "student") {
    if (a === "exam" && b) return <ExamRoom key={b} attemptId={Number(b)} />;
    return <Shell>{a === "result" && b ? <Result attemptId={Number(b)} /> : <StudentHome />}</Shell>;
  }
  let page = <Exams />;
  if (b === "questions") page = <Questions />;
  else if (b === "exams" && c === "new") page = <ExamEditor id={null} />;
  else if (b === "exams" && c && d === "edit") page = <ExamEditor id={Number(c)} />;
  else if (b === "exams" && c && d === "monitor") page = <Monitor id={Number(c)} />;
  else if (b === "exams" && c && d === "grading") page = <Grading id={Number(c)} />;
  else if (b === "exams" && c && d === "results") page = <Results id={Number(c)} />;
  return <Shell>{page}</Shell>;
}

export default function App() {
  return <MotionConfig reducedMotion="user"><SessionProvider><Routes /><Toasts /></SessionProvider></MotionConfig>;
}
