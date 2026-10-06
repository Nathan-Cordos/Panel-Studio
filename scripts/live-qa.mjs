import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await mkdir(path.join(root, "output"), { recursive: true });
process.env.PANEL_STUDIO_DATA = await mkdtemp(
  path.join(root, "output", "live-qa-"),
);
const { server } = await import("../server.mjs");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port;
const child = spawn(process.execPath, [path.join(root, "mcp.mjs")], {
  cwd: root,
  env: { ...process.env, PANEL_STUDIO_URL: url },
  stdio: ["pipe", "pipe", "pipe"],
});
let serial = 0;
const pending = new Map();
let stderr = "";
child.stderr.on("data", (d) => (stderr += d));
createInterface({ input: child.stdout }).on("line", (line) => {
  const result = JSON.parse(line);
  pending.get(result.id)?.(result);
  pending.delete(result.id);
});
const call = (name, args = {}) =>
  new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(
      () => reject(new Error("MCP timeout " + stderr)),
      20000,
    );
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result.result);
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }) + "\n",
    );
  });
const unpack = (result) => {
  assert.ok(!result.isError, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const chosenFolder = path.join(
    process.env.PANEL_STUDIO_DATA,
    "chosen-project-folder",
  );
  await mkdir(chosenFolder, { recursive: true });
  await page.locator("#newProject").click();
  await page.locator("#chooseProjectFolder").click();
  await page
    .locator("#folderEntries")
    .getByRole("button", { name: "▸ chosen-project-folder", exact: true })
    .click();
  await page.waitForFunction(
    (folder) => document.getElementById("browseFolderPath").value === folder,
    chosenFolder,
  );
  await page
    .locator("#folderBrowser")
    .screenshot({ path: path.join(root, "docs/folder-browser.png") });
  await page.locator("#useFolder").click();
  await page.waitForFunction(
    (folder) => document.getElementById("saveFolder").textContent === folder,
    chosenFolder,
  );
  await page.locator("#projectTitleInput").fill("Weekend market story");
  await page
    .locator("#storyInput")
    .fill(
      "A visitor arrives, browses a stall, chooses a print, and leaves with a wrapped parcel.",
    );
  await page.locator("#layoutPreset").selectOption("grid");
  await page
    .locator("#stylePreset")
    .selectOption({ label: "Flat editorial illustration" });
  for (let i = 0; i < 4; i++)
    await page
      .locator("#plan" + i)
      .fill(
        [
          "Arrive at the market entrance.",
          "Browse prints at the stall.",
          "Choose a print, close view of the artwork.",
          "Leave carrying one wrapped parcel.",
        ][i],
      );
  await page
    .locator("#referenceFiles")
    .setInputFiles(path.join(root, "assets/demo-originals/p01.png"));
  await page.locator(".reference-card").waitFor();
  await page
    .getByLabel("Reference role", { exact: true })
    .fill(
      "Camera direction reference only; do not copy the photographic style.",
    );
  await page.locator("#projectDialog").evaluate((el) => (el.scrollTop = 0));
  await page
    .locator("#projectDialog")
    .screenshot({ path: path.join(root, "docs/new-project.png") });
  await page.locator("#submitProject").click();
  await page.locator("#projectDialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator("#repair").isVisible(), false);
  assert.ok(!(await page.locator("#checks").textContent()).includes("tote"));
  assert.equal(await page.locator(".placeholder-note").count(), 4);
  await page
    .locator("#instruction")
    .fill(
      "Create the arrival shot using the project illustration style and selected reference.",
    );
  await page.locator("#queueRequest").click();

  await page
    .locator("#requestList")
    .getByText("pending", { exact: true })
    .waitFor();
  const project = await page.evaluate(() => window.panelStudio.getProject());
  const savedLocation = await fetch(
    url + "/api/projects/" + project.id + "/location",
  ).then((r) => r.json());
  assert.equal(savedLocation.directory, chosenFolder);
  assert.equal(
    JSON.parse(await readFile(savedLocation.filePath, "utf8")).id,
    project.id,
  );
  await page.waitForFunction(
    (folder) =>
      document.getElementById("projectLocation").textContent.includes(folder),
    chosenFolder,
  );
  const summary = unpack(
    await call("read_live_project", { projectId: project.id }),
  );
  assert.equal(summary.name, "Weekend market story");
  assert.equal(summary.panels[0].slot.ratio, 460 / 726);
  assert.equal(summary.references.length, 1);
  assert.ok(!JSON.stringify(summary).includes("data:image"));
  assert.equal(
    (
      await call("read_live_image", {
        projectId: project.id,
        referenceId: summary.references[0].id,
        outputPath: path.join(process.env.PANEL_STUDIO_DATA, "reference.png"),
      })
    ).content[1].type,
    "image",
  );
  const req = summary.requests[0];
  const claimed = unpack(
    await call("resolve_request", {
      projectId: project.id,
      requestId: req.id,
      expectedRevision: summary.revision,
      status: "in_progress",
      notes: "Inspecting selected references.",
    }),
  );
  await page
    .locator("#requestList")
    .getByText("in progress", { exact: true })
    .waitFor();
  const completed = unpack(
    await call("resolve_request", {
      projectId: project.id,
      requestId: req.id,
      expectedRevision: claimed.revision,
      status: "completed",
      notes:
        "Attached existing fixture artwork to test the delivery path; no generation was performed.",
      filePath: path.join(root, "assets/demo-originals/p02-after.png"),
      prompt: "QA fixture attachment, not a live generation.",
    }),
  );
  await page.waitForFunction(
    () => window.panelStudio.getProject().panels[0].versions.length === 2,
  );
  await page
    .locator("#requestList")
    .getByText("completed", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => window.panelStudio.getProject().panels[0].approved,
    ),
    false,
  );
  let examined;
  for (let i = 0; i < 10; i++) {
    examined = await call("examine_live_page", { projectId: project.id });
    if (!examined.isError) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  assert.ok(!examined.isError, examined.content?.[0]?.text);
  assert.equal(examined.content[1].mimeType, "image/png");
  const stale = await call("resolve_request", {
    projectId: project.id,
    requestId: req.id,
    expectedRevision: summary.revision,
    status: "blocked",
    notes: "Stale write",
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /Revision conflict/);
  await page.locator("#caption").fill("Local unsaved caption");
  const queued = await fetch(
    url + "/api/projects/" + project.id + "/requests",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: completed.revision,
        panelId: "P01",
        instruction: "Change the caption.",
      }),
    },
  ).then((r) => r.json());
  const next = queued.requests.at(-1);
  unpack(
    await call("resolve_request", {
      projectId: project.id,
      requestId: next.id,
      expectedRevision: queued.revision,
      status: "completed",
      notes: "Caption updated for conflict test.",
      caption: "Remote caption",
    }),
  );
  await page.locator("#reloadProject").waitFor();
  assert.equal(
    await page.locator("#caption").inputValue(),
    "Local unsaved caption",
  );
  page.once("dialog", (d) => d.accept());
  await page.locator("#reloadProject").click();
  await page.waitForFunction(
    () => document.getElementById("caption").value === "Remote caption",
  );
  // Reopen from the same saved library, then verify persistence across a reload.
  await page.reload();
  await page.waitForFunction(
    () => window.panelStudio.getProject().name === "Weekend market story",
  );
  assert.equal(await page.locator("#caption").inputValue(), "Remote caption");
  await page.locator(".shot-details summary").click();
  assert.equal(await page.locator(".reference-choice input").isChecked(), true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "docs/live-workflow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#projectSettings").click();
  assert.ok(
    await page
      .locator("#projectDialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.screenshot({
    path: path.join(root, "docs/new-project-mobile.png"),
  });
  await page.locator("#closeProject").click();
  await page.locator("#openTop").click();
  await page.waitForFunction(
    (folder) => document.getElementById("browseFolderPath").value === folder,
    process.env.PANEL_STUDIO_DATA,
  );
  await page
    .locator("#browseFolderPath")
    .fill(path.join(chosenFolder, "missing-folder"));
  await page
    .locator("#browseFolderForm")
    .getByRole("button", { name: "Go", exact: true })
    .click();
  await page
    .locator("#folderBrowserError")
    .filter({ hasText: "Cannot open this folder" })
    .waitFor();
  await page.locator("#browseFolderPath").fill(chosenFolder);
  await page
    .locator("#browseFolderForm")
    .getByRole("button", { name: "Go", exact: true })
    .click();
  await page
    .locator("#folderEntries")
    .getByRole("button", {
      name: "▦ " + path.basename(savedLocation.filePath),
      exact: true,
    })
    .click();
  await page.locator("#folderBrowser").waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => window.panelStudio.getProject().id),
    project.id,
  );
  assert.deepEqual(errors, []);
  assert.equal(stderr, "");
  const { openLiveFile, listProjects, readLive } =
    await import("../live-store.mjs");
  const reopened = await openLiveFile(savedLocation.filePath);
  assert.equal(reopened.id, project.id);
  assert.equal(reopened.requests.length, 2);
  assert.equal(
    (await readLive(project.id)).panels[0].caption,
    "Remote caption",
  );
  assert.equal(
    (await listProjects()).find((p) => p.id === project.id).filePath,
    savedLocation.filePath,
  );

  console.log(
    "Live MCP + browser workflow passed: creation, references, queue, attachment, automatic refresh, current preview, stale rejection and unsaved-edit protection.",
  );
} finally {
  child.kill();
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
