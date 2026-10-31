import { useState, type FormEvent } from "react";
import { GraduationCap } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import { Button, Field, input } from "../components/ui";

export default function Login() {
  const { setMe } = useSession();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const me = await api.login(login, password); setMe(me); location.hash = me.role === "teacher" ? "/teacher" : "/"; }
    catch (err) { setError((err as ApiError).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><img src="/app/favicon.svg" alt="" className="size-10" /><span className="text-xl font-extrabold">Ruang Ujian</span></div>
        <div>
          <p className="text-4xl leading-tight font-extrabold">Computer-based tests that keep time, keep answers, and keep it fair.</p>
          <ul className="mt-8 space-y-3 text-white/80">
            <li>• The server keeps the clock; every answer is saved as you click.</li>
            <li>• Questions and options are shuffled for each student.</li>
            <li>• Teachers see every student live, then the item analysis.</li>
          </ul>
        </div>
        <p className="text-sm text-white/50">SMA Contoh Nusantara is a fictional school. Portfolio project by Dinul Iman.</p>
        <GraduationCap className="absolute -right-10 -bottom-10 size-72 text-white/5" aria-hidden />
      </aside>
      <main className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm" noValidate>
          <h1 className="text-3xl font-extrabold">Sign in</h1>
          <p className="mt-1 text-muted">Students use their NIS, teachers their NIP or email.</p>
          <div className="mt-8 space-y-4">
            <Field label="NIS / NIP / email"><input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" className={input()} /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={input()} /></Field>
          </div>
          {error && <p className="mt-4 rounded-xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy || !login || !password}>Sign in</Button>
          <div className="mt-8 rounded-xl bg-panel-2 px-4 py-3 text-[13px] text-muted">
            <p className="font-bold text-fg">Demo accounts</p>
            <p>Student: NIS <b>24001</b> to <b>24030</b>, password <b>siswa1234</b></p>
            <p>Teacher: <b>ratna@sma-contoh.sch.id</b>, password <b>guru1234</b></p>
            <p className="mt-1">Token for the open exam: <b className="font-mono">BIO24X</b></p>
          </div>
        </form>
      </main>
    </div>
  );
}
