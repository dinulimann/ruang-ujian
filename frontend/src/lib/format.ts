const tz = { timeZone: "Asia/Jakarta" } as const;
export const dateTime = (iso: string) => new Date(iso).toLocaleString("id-ID", { ...tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const time = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { ...tz, hour: "2-digit", minute: "2-digit" });
export const num = (n: number, d = 1) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(n);
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
};
/** For <input type="datetime-local">: the wall-clock time in Jakarta. */
export const toLocalInput = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16);
export const fromLocalInput = (v: string) => new Date(`${v}:00+07:00`).toISOString();
