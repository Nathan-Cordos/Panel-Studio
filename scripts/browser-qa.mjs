import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { server } from "../server.mjs";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page
    .locator(".panel img")
    .evaluateAll((images) => Promise.all(images.map((im) => im.decode())));
  await page.getByRole("button", { name: "Approve image" }).click();
  assert.match(
    await page.locator("#status").textContent(),
    /Complete all four/,
  );
  await page.getByRole("button", { name: "Load corrected example" }).click();
  assert.equal(await page.locator("#versions button").count(), 2);
  for (const checkbox of await page.locator("#checks input").all())
    await checkbox.check();
  await page.getByRole("button", { name: "Approve image" }).click();
  assert.equal(await page.locator(".panel.approved").count(), 1);
  await page.locator("#checks input").first().uncheck();
  assert.equal(await page.locator(".panel.approved").count(), 0);
  assert.equal(await page.locator("#approve").textContent(), "Approve image");
  assert.match(await page.locator("#pageState").textContent(), /0\/4 approved/);
  await page.locator("#checks input").first().check();
  await page.locator("#approve").click();
  await page.locator("#caption").fill("Edited caption");
  assert.equal(await page.locator(".panel.approved").count(), 0);
  await page.locator("#caption").fill("02 / Continue");
  await page.locator("#caption").blur();
  await mkdir(path.join(root, "docs"), { recursive: true });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "docs/workspace.png"),
    fullPage: true,
  });
  await page.locator("#compareTop").click();
  await page.waitForFunction(
    () => document.getElementById("afterCanvas").width === 1000,
  );
  await page.waitForFunction(
    () =>
      document.getElementById("comparison").getBoundingClientRect().top <
      innerHeight,
  );
  assert.equal(
    await page.locator("#compareTop").getAttribute("aria-expanded"),
    "true",
  );
  await page.screenshot({
    path: path.join(root, "docs/comparison.png"),
    fullPage: true,
  });
  await page.locator("#backToSheet").click();
  assert.equal(await page.locator("#comparison").isVisible(), false);
  const saved = await page.evaluate(() => window.panelStudio.getProject());
  const fixture = path.join(root, "docs/qa-project.json");
  await writeFile(fixture, JSON.stringify(saved, null, 2));
  await page.locator("#rough").click();
  await page.locator("#open").setInputFiles(fixture);
  await page
    .getByRole("status")
    .filter({ hasText: "Project restored" })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.panelStudio.getProject().panels[1].active),
    1,
  );
  const exportDir = path.join(root, "output", "exports");
  await mkdir(exportDir, { recursive: true });
  await page.locator("#export").click();
  await page.waitForFunction(
    () => document.getElementById("exportPreview").width === 500,
  );
  await page.locator("#exportWidth").selectOption("1000");
  async function downloadExport(name) {
    const promise = page.waitForEvent("download", { timeout: 60000 });
    await page.locator("#downloadExport").click();
    const file = await promise;
    await file.saveAs(path.join(exportDir, name));
    await page.waitForFunction(
      () => !document.getElementById("downloadExport").disabled,
    );
    return readFile(path.join(exportDir, name));
  }
  const png = await downloadExport("screen.png");
  assert.equal(png.readUInt32BE(16), 1000);
  assert.equal(png.readUInt32BE(20), 1532);
  await page.locator("#exportFormat").selectOption("pdf");
  await page.waitForFunction(() =>
    document.getElementById("resolutionNote").textContent.includes("ppi"),
  );
  await page.screenshot({
    path: path.join(root, "docs/export.png"),
    fullPage: false,
  });
  const pdf = await downloadExport("print.pdf");
  const boxes = await page.evaluate(async (data) => {
    const pdf = await PDFLib.PDFDocument.load(
      Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
    );
    const p = pdf.getPage(0);
    return {
      trim: p.getTrimBox(),
      bleed: p.getBleedBox(),
      media: p.getMediaBox(),
    };
  }, pdf.toString("base64"));
  assert.ok(Math.abs(boxes.trim.width - (210 * 72) / 25.4) < 0.01);
  assert.ok(Math.abs(boxes.bleed.width - (216 * 72) / 25.4) < 0.01);
  assert.ok(boxes.media.width > boxes.bleed.width);
  await page.locator("#exportFormat").selectOption("zip");
  const archive = await downloadExport("handoff.zip");
  const contents = await page.evaluate(async (data) => {
    const z = await JSZip.loadAsync(
      Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
    );
    const l = JSON.parse(await z.file("layout.json").async("string"));
    const p = JSON.parse(await z.file("project.json").async("string"));
    const im = await createImageBitmap(
      await z.file("layers/P02-caption.png").async("blob"),
    );
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    c.getContext("2d").drawImage(im, 0, 0);
    return {
      files: Object.keys(z.files),
      layout: l,
      embedded: p.panels.every((p) =>
        p.versions.every((v) => v.image.startsWith("data:")),
      ),
      alpha: c.getContext("2d").getImageData(0, 0, 1, 1).data[3],
    };
  }, archive.toString("base64"));
  assert.equal(contents.layout.width, 1000);
  assert.equal(contents.layout.panels.length, 4);
  assert.equal(contents.embedded, true);
  assert.equal(contents.alpha, 0);
  assert.ok(contents.files.includes("captions.svg"));
  assert.ok(contents.files.includes("sources/P02.png"));
  // Oversized captions fail visibly instead of being silently cropped in delivery files.
  assert.match(
    await page.evaluate(async () => {
      const { pageCanvas } = await import("./render.js");
      const p = window.panelStudio.getProject();
      p.panels[1].caption = "Long caption ".repeat(500);
      try {
        await pageCanvas(p);
        return "";
      } catch (e) {
        return e.message;
      }
    }),
    /too long/,
  );
  await page.locator("#closeExport").click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator("#export").click();
  await page.locator("#exportFormat").selectOption("pdf");
  await page.waitForFunction(() =>
    document.getElementById("resolutionNote").textContent.includes("ppi"),
  );
  assert.ok(
    await page
      .locator("#exportDialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  );
  await page.screenshot({ path: path.join(root, "docs/export-mobile.png") });
  await page.locator("#closeExport").click();
  const download = page.waitForEvent("download");
  await page.locator("#saveTop").click();
  assert.equal(
    (await download).suggestedFilename(),
    "panel-studio-project.json",
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(root, "docs/mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log("Browser checks passed. No live model call was made.");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
