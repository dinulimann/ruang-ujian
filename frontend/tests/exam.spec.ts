import { expect, test, type Browser, type Page } from "@playwright/test";

const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  // Browsers log every 4xx; some are expected (signed-out check, wrong token, locked device).
  page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(m.text()); });
});
test.afterEach(() => expect(errors).toEqual([]));

async function signIn(page: Page, login: string, password: string) {
  await page.goto("/");
  await page.getByLabel("NIS / NIP / email").fill(login);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function startOpenExam(page: Page) {
  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await page.getByLabel("Exam token").fill("WRONG1");
  await page.getByRole("button", { name: "Start the exam" }).click();
  await expect(page.getByText("That token is not right")).toBeVisible();
  await page.getByLabel("Exam token").fill("BIO24X");
  await page.getByRole("button", { name: "Start the exam" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
}

const nav = (page: Page, n: number) => page.getByRole("list", { name: "Questions" }).getByRole("listitem").nth(n - 1);

test("a student's answers, unsure marks and clock survive a reload", async ({ page }) => {
  await signIn(page, "24010", "siswa1234");
  await startOpenExam(page);
  const firstOption = async () => { const radios = page.getByRole("radio"); if (await radios.count()) await radios.first().click(); else await page.getByLabel("Your answer").fill("Jawaban saya"); };
  await firstOption();
  await page.getByRole("button", { name: /^Next/ }).click();
  await firstOption();
  await page.getByRole("button", { name: "Mark unsure" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  const before = await page.getByRole("timer").textContent();
  await page.reload();
  await expect(nav(page, 1)).toHaveAttribute("aria-label", /answered/);
  await expect(nav(page, 2)).toHaveAttribute("aria-label", /unsure/);
  const after = await page.getByRole("timer").textContent();
  expect(after! <= before!).toBe(true); // the clock kept running; it did not restart
  await page.getByRole("button", { name: "Finish", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("unsure");
  await page.getByRole("button", { name: "Finish and submit" }).click();
  // A score if every essay was left blank (marked 0 at once), otherwise "being marked" until the teacher reads them.
  await expect(page.getByTestId("score").or(page.getByTestId("pending"))).toBeVisible();
});

test("answers given offline are sent when the connection returns", async ({ page, context }) => {
  await signIn(page, "24012", "siswa1234");
  await startOpenExam(page);
  await context.setOffline(true);
  const radios = page.getByRole("radio");
  if (!(await radios.count())) await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("radio").nth(1).click();
  await expect(page.getByTestId("save-status")).toContainText("Offline");
  await context.setOffline(false);
  await expect(page.getByTestId("save-status")).toHaveText("Saved", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
});

async function teacher(browser: Browser) {
  const p = await (await browser.newContext()).newPage();
  await signIn(p, "ratna@sma-contoh.sch.id", "guru1234");
  return p;
}

test("an exam stays on one device until the teacher releases it", async ({ page, browser }) => {
  await signIn(page, "24013", "siswa1234");
  await startOpenExam(page);
  const other = await (await browser.newContext()).newPage();
  await signIn(other, "24013", "siswa1234");
  await other.getByRole("button", { name: "Continue" }).click();
  await expect(other.getByText("Exam locked to another device")).toBeVisible();

  const t = await teacher(browser);
  await t.goto("/#/teacher/exams/2/monitor");
  await expect(t.getByTestId("token")).toHaveText("BIO24X");
  await t.getByRole("button", { name: "Release Maya Sari's device" }).click();
  await expect(t.getByText("Maya Sari can continue on another device")).toBeVisible();
  await other.getByRole("button", { name: "Try again" }).click();
  await expect(other.getByRole("timer")).toBeVisible();
});

test("the teacher gives a student more time from the monitor", async ({ page, browser }) => {
  await signIn(page, "24014", "siswa1234");
  await startOpenExam(page);
  const t = await teacher(browser);
  await t.goto("/#/teacher/exams/2/monitor");
  await t.getByRole("button", { name: "Give Naufal Rizky 10 more minutes" }).click();
  await expect(t.getByText("Naufal Rizky: +10 minutes")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("timer")).toHaveText(/^1:3\d:\d\d$/); // 90 minutes + 10, minus a few seconds
});

test("marking essays and reading the item analysis", async ({ browser }) => {
  const t = await teacher(browser);
  await t.goto("/#/teacher/exams/1/grading");
  await expect(t.getByText("3 answers waiting")).toBeVisible();
  const card = t.getByRole("listitem", { name: /Answer by/ }).first();
  await card.getByRole("radio", { name: "4", exact: true }).click();
  await card.getByRole("button", { name: "Save mark" }).click();
  await expect(t.getByText("2 answers waiting")).toBeVisible();

  await t.goto("/#/teacher/exams/1/results");
  await expect(t.getByTestId("summary")).toContainText("/ 46");
  const table = t.getByRole("table", { name: "Item analysis" });
  await expect(table.getByText("Weaker students do better: check the key")).toBeVisible();
  await expect(table.getByText("Ribosom ✓ key")).toBeVisible();
});

test("importing questions from a spreadsheet, checked first", async ({ browser }) => {
  const t = await teacher(browser);
  await t.goto("/#/teacher/questions");
  await t.getByRole("button", { name: "Import" }).click();
  const bad = "type,question,a,b,c,d,e,answer,points\nmcq,Soal tanpa kunci yang benar,Satu,Dua,,,,F,1\n";
  await t.getByLabel("Question file").setInputFiles({ name: "soal.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await t.getByRole("button", { name: "Check file" }).click();
  await expect(t.getByRole("alert")).toContainText("Row 2");
  const good = "type,question,a,b,c,d,e,answer,points\nmcq,Satuan terkecil makhluk hidup adalah,Sel,Jaringan,Organ,,,A,1\nessay,Jelaskan fungsi mitokondria.,,,,,,,4\n";
  await t.getByLabel("Question file").setInputFiles({ name: "soal.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await t.getByRole("button", { name: "Check file" }).click();
  await expect(t.getByTestId("import-check")).toContainText("2 questions ready");
  await t.getByRole("button", { name: /^Import 2/ }).click();
  await expect(t.getByText("2 questions imported")).toBeVisible();
  await expect(t.getByRole("list", { name: "Questions" })).toContainText("Satuan terkecil makhluk hidup adalah");
});
