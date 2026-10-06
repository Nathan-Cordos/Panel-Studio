import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "docs", "workflow");
await mkdir(out, { recursive: true });
await mkdir(path.join(root, "output"), { recursive: true });
process.env.PANEL_STUDIO_DATA = await mkdtemp(
  path.join(root, "output", "walkthrough-"),
);
const { server } = await import("../server.mjs");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
process.env.PANEL_STUDIO_URL = base;
const { callLive } = await import("../live-mcp.mjs");
const browser = await chromium.launch({ headless: true });
const shots = [
  "A woman walks right along the storefront toward the café.",
  "Continue toward the doorway; keep the same direction and camera side.",
  "Show the walking detail: shoes, pavement and tote.",
  "Arrive at the navy café entrance.",
];
try {
  const p = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  await p.goto(base);
  await p.locator("#newProject").click();
  await p.locator("#projectTitleInput").fill("A walk to the café");
  await p
    .locator("#storyInput")
    .fill(
      "A four-shot sequence: approach the café, continue along the storefront, show a walking detail, and arrive at the entrance. Movement stays left to right.",
    );
  await p
    .locator("#stylePreset")
    .selectOption({ label: "Natural editorial photography" });
  for (let i = 0; i < 4; i++) await p.locator("#plan" + i).fill(shots[i]);
  await p
    .locator("#referenceFiles")
    .setInputFiles(path.join(root, "assets/demo-originals/p01.png"));
  await p.locator(".reference-card").waitFor();
  await p
    .getByLabel("Reference role", { exact: true })
    .fill("Keep the subject, outfit, café setting and afternoon light.");
  await p.locator("#projectDialog").evaluate((el) => (el.scrollTop = 0));
  await p
    .locator("#projectDialog")
    .screenshot({ path: path.join(out, "capture-project.png") });
  await p.locator("#submitProject").click();
  await p.locator("#projectDialog").waitFor({ state: "hidden" });
  const files = ["p01", "p02-before", "p03", "p04"];
  for (let i = 0; i < 4; i++) {
    await p.locator(`[data-panel="P0${i + 1}"]`).click();
    await p
      .locator("#upload")
      .setInputFiles(
        path.join(root, "public/art/movement", files[i] + ".webp"),
      );
    await p.waitForFunction(
      (i) => window.panelStudio.getProject().panels[i].versions.length === 2,
      i,
    );
  }
  await p.locator('[data-panel="P02"]').click();
  await p
    .locator("#instruction")
    .fill(
      "Make her walk right toward the café, matching shots 1 and 3. Keep the storefront, outfit and tote. Change her pose; do not mirror the whole image.",
    );
  await p.locator("#queueRequest").click();
  await p
    .locator("#requestList")
    .getByText("pending", { exact: true })
    .waitFor();
  await p.setViewportSize({ width: 1440, height: 2400 });
  await p.evaluate(() => scrollTo(0, 0));
  await p
    .locator("aside")
    .screenshot({ path: path.join(out, "capture-request.png") });
  const project = await p.evaluate(() => window.panelStudio.getProject());
  const request = project.requests.at(-1);
  const result = await callLive("resolve_request", {
    projectId: project.id,
    requestId: request.id,
    expectedRevision: project.revision,
    status: "completed",
    notes:
      "Walkthrough: attached the previously generated café correction. No new generation was run.",
    filePath: path.join(root, "assets/demo-originals/p02-after.png"),
    prompt:
      "Walkthrough replay of the saved correction; original generation provenance is in assets/movement-prompts.json.",
  });
  if (result.isError) throw Error(JSON.stringify(result));
  await p.waitForFunction(
    () => window.panelStudio.getProject().panels[1].versions.length === 3,
  );
  // Capture the actual current preview through MCP; keep review pending.
  for (let i = 0; i < 15; i++) {
    const preview = await callLive("examine_live_page", {
      projectId: project.id,
    }).catch(() => null);
    if (preview?.content?.[1]) {
      await writeFile(
        path.join(out, "capture-page.png"),
        Buffer.from(preview.content[1].data, "base64"),
      );
      break;
    }
    await p.waitForTimeout(300);
  }
  const data = async (f) =>
    "data:image/png;base64," + (await readFile(f)).toString("base64");
  const form = await data(path.join(out, "capture-project.png")),
    inspector = await data(path.join(out, "capture-request.png")),
    before = await data(
      path.join(root, "assets/demo-originals/p02-before.png"),
    ),
    after = await data(path.join(root, "assets/demo-originals/p02-after.png"));
  const steps = [
    {
      title: "Start with the sequence.",
      tag: "01 / PLAN",
      intro: "Open Panel Studio → New project",
      body: "Name the project, describe what happens and choose a layout. Set the art direction, write the four shot briefs and add reference images.",
      detail:
        "Give each reference a purpose: subject identity, setting, palette or a specific object.",
      visual: `<div class="shot form"><img src="${form}"></div>`,
      foot: "Actual project form · café example",
    },
    {
      title: "Write the change where it belongs.",
      tag: "02 / REQUEST",
      intro: "Select a shot → Save request for Codex",
      body: "Upload existing artwork or start with an empty shot. Write what should change—and which details need to stay consistent.",
      detail:
        "Saving puts the instruction in the project’s request list. It does not start generation.",
      visual: `<div class="request"><img class="small-art" src="${before}"><div class="shot inspector"><img src="${inspector}"></div></div>`,
      foot: "Actual editor · a saved request for shot 2",
    },
    {
      title: "Ask Codex to do the work.",
      tag: "03 / CODEX",
      intro: "In a chat with the Panel Studio plugin enabled",
      body: "Use Copy project request, or tell Codex which project to work on. Keep the editor open so the revised artwork can appear there.",
      detail:
        "The plugin reads and updates the project. Codex needs an available image-generation tool to make the artwork.",
      visual: `<div class="flow"><span class="micro">EXAMPLE MESSAGE TO CODEX</span><blockquote>Resolve the pending requests in “A walk to the café”. Use the saved briefs and references, then inspect the updated page.</blockquote><div class="flowrow"><b>Read the project</b><span>Story · references · instructions</span></div><div class="connector">↓</div><div class="flowrow"><b>Generate the revision</b><span>Using the available image tool</span></div><div class="connector">↓</div><div class="flowrow"><b>Return it to the editor</b><span>New version · original preserved</span></div></div>`,
      foot: "Workflow diagram · example instruction, not a chat transcript",
    },
    {
      title: "Compare. Check. Approve.",
      tag: "04 / REVIEW",
      intro: "Return to Panel Studio → Compare",
      body: "The saved revision appears automatically when the editor has no unsaved changes. Compare the images and check the full page before approving.",
      detail:
        "Finished the review? Export a screen PNG, a print PDF or an editable handoff ZIP.",
      visual: `<div class="pair"><figure><img src="${before}"><figcaption><b>Before</b><span>The stride reverses the sequence.</span></figcaption></figure><figure><img src="${after}"><figcaption><b>After</b><span>The body travels toward the café.</span></figcaption></figure><p class="note">Saved generated example, replayed through MCP for this walkthrough. No new model call was made.</p><div class="reviewpill">Request completed ≠ image approved</div></div>`,
      foot: "Before / after · human review remains separate",
    },
  ];
  const css = `*{box-sizing:border-box}body{margin:0;background:#efeee8;color:#203831;font-family:Segoe UI,Arial,sans-serif}.slide{width:1600px;height:1000px;padding:48px 64px;position:relative;overflow:hidden}.top{display:flex;justify-content:space-between;border-bottom:1px solid #b7c4b9;padding-bottom:22px;font-size:19px}.brand{font-weight:700;letter-spacing:.5px}.top span:last-child{color:#68796d}.content{display:grid;grid-template-columns:440px 1fr;gap:70px;margin-top:54px;align-items:center;height:732px}.tag{font:600 17px Segoe UI;letter-spacing:3px;color:#527761}h1{font-size:61px;line-height:1.06;font-weight:600;letter-spacing:-2.8px;margin:24px 0 30px}.intro{font-size:22px;font-weight:600;line-height:1.4}.body{font-size:23px;line-height:1.55;color:#4c5b53}.detail{font-size:19px;line-height:1.55;border-left:3px solid #829780;padding-left:20px;margin-top:30px;color:#546458}.visual{height:732px;display:flex;align-items:center;justify-content:center}.shot{background:white;border:1px solid #cbd0c7;border-radius:12px;overflow:hidden;box-shadow:0 18px 40px #1f3b3020}.form{height:732px;width:607px}.form img{width:607px}.request{display:flex;align-items:center;gap:20px;width:100%}.small-art{width:290px;height:400px;object-fit:cover;object-position:25% center;border-radius:8px}.inspector{width:440px;height:732px}.inspector img{width:100%}.flow{width:100%;background:#203831;border-radius:18px;color:#f6f6ed;padding:40px}.micro{font-size:15px;letter-spacing:2px;color:#c6d6bf}blockquote{font-size:27px;line-height:1.5;margin:24px 0 32px;padding-bottom:30px;border-bottom:1px solid #627a68}.flowrow{background:#324c40;border-radius:9px;padding:20px 25px;display:flex;justify-content:space-between;align-items:center;gap:25px}.flowrow b{font-size:23px}.flowrow span{font-size:17px;color:#d4dfcd;max-width:205px}.connector{text-align:center;padding:9px;font-size:22px;color:#b9d0aa}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;width:100%}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #cbd0c7}figure img{width:100%;height:380px;object-fit:cover}figcaption{padding:20px;display:grid;gap:10px}figcaption b{font-size:25px}figcaption span{font-size:18px;line-height:1.4;color:#536355}.note{grid-column:1/3;font-size:17px;line-height:1.5;color:#607061}.reviewpill{grid-column:1/3;border-top:1px solid #bdcabb;padding-top:20px;font-size:21px;font-weight:600}.footer{position:absolute;bottom:33px;left:64px;right:64px;display:flex;justify-content:space-between;font-size:15px;letter-spacing:.3px;color:#607263}`;
  const design = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const html = `<!doctype html><meta charset="utf-8"><title>${s.title}</title><style>${css}</style><article class="slide"><header class="top"><span class="brand">Panel Studio / Codex</span><span>From brief to reviewed sequence</span></header><div class="content"><section><span class="tag">${s.tag}</span><h1>${s.title}</h1><p class="intro">${s.intro}</p><p class="body">${s.body}</p><p class="detail">${s.detail}</p></section><section class="visual">${s.visual}</section></div><footer class="footer"><span>${s.foot}</span><span>0${i + 1} / 04</span></footer></article>`;
    await design.setContent(html);
    await design
      .locator("img")
      .evaluateAll((ims) => Promise.all(ims.map((im) => im.decode())));
    await design.screenshot({
      path: path.join(
        out,
        `0${i + 1}-${["plan", "request", "codex", "review"][i]}.png`,
      ),
    });
  }
  await writeFile(
    path.join(out, "README.md"),
    `# Panel Studio + Codex walkthrough\n\nFour 1600 × 1000 PNGs explaining the project and editing workflow. The form and request inspector are real UI captures. Step 3 is an instructional diagram, not a fabricated Codex screenshot. The café correction was generated previously; this script replays attachment through the live MCP implementation and leaves human approval pending. No paid generation is run.\n\nRegenerate with \`node scripts/workflow-visuals.mjs\`. Requires the browser-test dependencies. Captures use an isolated temporary project under ignored output/, leaving the user's projects and browser untouched.\n`,
  );
  console.log("Created four workflow visuals in docs/workflow.");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
