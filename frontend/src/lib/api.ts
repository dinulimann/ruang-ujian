// Client for the Laravel API. Sanctum keeps the session in a cookie; writes send the XSRF-TOKEN cookie back as a header.

export interface Me { id: number; name: string; number: string; role: "teacher" | "student"; class: string | null; }
export interface Option { id: number; body: string; is_correct?: boolean; }
export interface PaperQuestion {
  id: number; number: number; type: "mcq" | "essay"; body: string; points: number; image_url: string | null; options: Option[];
  answer: { option_id: number | null; essay: string | null; flagged: boolean; seq: number };
}
export interface AttemptView {
  id: number; status: "in_progress" | "submitted" | "graded"; exam: { id: number; title: string; subject: string };
  server_now: string; deadline_at: string; grace_seconds: number; questions?: PaperQuestion[];
}
export interface StudentExam {
  id: number; title: string; subject: string; opens_at: string; closes_at: string; duration_minutes: number; questions: number;
  attempt: { id: number; status: string; score: number | null; max_score: number } | null;
}
export interface Result {
  id: number; status: string; exam: { title: string; subject: string; closes_at: string }; submitted_at: string; auto_submitted: boolean;
  show_results: boolean; score?: number; max_score?: number; review?: ReviewItem[] | null; review_from?: string;
}
export interface ReviewItem { number: number; type: "mcq" | "essay"; body: string; points: number; awarded: number | null; feedback: string | null; essay: string | null; chosen: number | null; correct: number | null; options: Option[]; }
export interface Question { id: number; subject_id: number; subject: string; type: "mcq" | "essay"; body: string; image_url: string | null; points: number; options: Option[]; created_at: string; }
export interface Meta { subjects: { id: number; name: string }[]; class_groups: { id: number; name: string; students_count: number }[]; }
export interface Exam {
  id: number; title: string; subject_id: number; subject: string; opens_at: string; closes_at: string; duration_minutes: number; token: string;
  shuffle_questions: boolean; shuffle_options: boolean; show_results: boolean; class_groups: { id: number; name: string }[];
  questions?: number | { id: number; question_id: number; position: number; type: string; body: string; points: number }[];
  started?: number; submitted?: number; to_grade?: number;
}
export interface MonitorRow {
  student: { id: number; name: string; number: string; class: string };
  attempt: { id: number; status: string; answered: number; started_at: string; deadline_at: string; extra_minutes: number; tab_switches: number; device_locked: boolean; last_saved: string | null; score: number | null; auto_submitted: boolean } | null;
}
export interface Item { id: number; position: number; type: string; body: string; points: number; difficulty: number | null; discrimination: number | null; ungraded: number; flags: string[]; options?: (Option & { chosen: number })[]; blank?: number; }
export interface Results {
  exam: Exam; analysis: { attempts: number; summary: { mean: number; median: number; min: number; max: number; max_score: number } | null; items: Item[] };
  attempts: { id: number; student: string; number: string; class: string; status: string; score: number | null; max_score: number; submitted_at: string | null; auto_submitted: boolean; tab_switches: number }[];
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors: Record<string, string[]> = {}, public details: unknown = null) { super(message); }
}

const xsrf = () => decodeURIComponent(document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="))?.slice(11) ?? "");

export async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const write = method !== "GET";
  if (write && !xsrf()) await fetch("/sanctum/csrf-cookie", { credentials: "same-origin" });
  const form = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(path, {
      method, credentials: "same-origin",
      headers: { Accept: "application/json", ...(body && !form ? { "Content-Type": "application/json" } : {}), ...(write ? { "X-XSRF-TOKEN": xsrf() } : {}) },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "No connection to the server.");
  }
  if (res.status === 419 && !retried) { // CSRF token expired with the session: get a new one and retry once
    await fetch("/sanctum/csrf-cookie", { credentials: "same-origin" });
    return request(method, path, body, true);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, data?.code ?? "error", data?.message ?? `Request failed (${res.status}).`, data?.errors ?? {}, data?.details ?? null);
  return data as T;
}

export const api = {
  login: (login: string, password: string) => request<Me>("POST", "/api/login", { login, password }),
  logout: () => request<void>("POST", "/api/logout"),
  me: () => request<Me>("GET", "/api/me"),
  student: {
    exams: () => request<{ server_now: string; exams: StudentExam[] }>("GET", "/api/student/exams"),
    start: (examId: number, token: string) => request<{ attempt_id: number; status: string }>("POST", `/api/student/exams/${examId}/start`, { token }),
    attempt: (id: number) => request<AttemptView>("GET", `/api/student/attempts/${id}`),
    save: (id: number, qid: number, body: { option_id?: number | null; essay?: string | null; flagged: boolean; seq: number }) =>
      request<{ saved: boolean; seq: number; server_now: string }>("PUT", `/api/student/attempts/${id}/answers/${qid}`, body),
    event: (id: number, type: "tab_hidden" | "fullscreen_exit" | "offline" | "online") => request<void>("POST", `/api/student/attempts/${id}/events`, { type }),
    submit: (id: number) => request<{ status: string }>("POST", `/api/student/attempts/${id}/submit`),
    result: (id: number) => request<Result>("GET", `/api/student/attempts/${id}/result`),
  },
  teacher: {
    meta: () => request<Meta>("GET", "/api/teacher/meta"),
    questions: (p: Record<string, string | number>) => request<{ data: Question[]; total: number; page: number; last_page: number }>("GET", `/api/teacher/questions?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== "" && v !== 0).map(([k, v]) => [k, String(v)]))}`),
    saveQuestion: (id: number | null, f: FormData) => request<Question>("POST", id ? `/api/teacher/questions/${id}` : "/api/teacher/questions", f),
    deleteQuestion: (id: number) => request<void>("DELETE", `/api/teacher/questions/${id}`),
    importQuestions: (f: FormData) => request<{ valid?: number; preview?: Record<string, string>[]; imported?: number }>("POST", "/api/teacher/questions/import", f),
    exams: () => request<Exam[]>("GET", "/api/teacher/exams"),
    exam: (id: number) => request<Exam>("GET", `/api/teacher/exams/${id}`),
    saveExam: (id: number | null, body: unknown) => request<Exam>(id ? "PUT" : "POST", id ? `/api/teacher/exams/${id}` : "/api/teacher/exams", body),
    newToken: (id: number) => request<{ token: string }>("POST", `/api/teacher/exams/${id}/token`),
    monitor: (id: number) => request<{ exam: Exam; questions: number; server_now: string; students: MonitorRow[] }>("GET", `/api/teacher/exams/${id}/monitor`),
    extend: (attemptId: number, minutes: number) => request<unknown>("POST", `/api/teacher/attempts/${attemptId}/extend`, { minutes }),
    resetDevice: (attemptId: number) => request<unknown>("POST", `/api/teacher/attempts/${attemptId}/reset-device`),
    essays: (id: number, all: boolean) => request<{ question: { id: number; position: number; body: string; points: number }; answers: { id: number; student: string; essay: string | null; points_awarded: number | null; feedback: string | null }[] }[]>("GET", `/api/teacher/exams/${id}/essays${all ? "?all=1" : ""}`),
    grade: (answerId: number, points: number, feedback: string) => request<unknown>("POST", `/api/teacher/answers/${answerId}/grade`, { points, feedback }),
    results: (id: number) => request<Results>("GET", `/api/teacher/exams/${id}/results`),
  },
};
