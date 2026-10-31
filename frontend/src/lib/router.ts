import { useEffect, useState } from "react";

export interface Loc { path: string[]; params: URLSearchParams; }
const read = (): Loc => {
  const [p, q = ""] = location.hash.replace(/^#\/?/, "").split("?");
  return { path: p.split("/").filter(Boolean), params: new URLSearchParams(q) };
};
export function useLoc() {
  const [loc, set] = useState(read);
  useEffect(() => { const on = () => set(read()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  return loc;
}
export const go = (p: string) => { location.hash = p; };
