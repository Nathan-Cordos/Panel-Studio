import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemo, reviewCategories } from "./public/model.js";
const root = path.dirname(fileURLToPath(import.meta.url));
test("MCP handshake, image inspection, versioned update, stale write rejection and native page export", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "panel-studio-mcp-")),
    file = path.join(dir, "project.json");
  const p = createDemo();
  p.panels[1].checks = [...reviewCategories];
  p.panels[1].approved = true;
  await writeFile(file, JSON.stringify(p));
  const child = spawn(process.execPath, [path.join(root, "mcp.mjs")], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let serial = 0;
  const pending = new Map();
  let stderr = "";
  child.stderr.on("data", (x) => (stderr += x));
  createInterface({ input: child.stdout }).on("line", (line) => {
    const result = JSON.parse(line);
    pending.get(result.id)?.(result);
    pending.delete(result.id);
  });
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++serial,
        timer = setTimeout(
          () => reject(new Error("MCP timeout: " + stderr)),
          10000,
        );
      pending.set(id, (x) => {
        clearTimeout(timer);
        resolve(x);
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  try {
    let r = await call("initialize", { protocolVersion: "2025-06-18" });
    assert.equal(r.result.serverInfo.name, "panel-studio");
    r = await call("tools/list");
    assert.deepEqual(
      r.result.tools.map((x) => x.name),
      ["read_project", "read_panel_image", "update_panel", "examine_page", "list_projects", "read_live_project", "read_live_image", "resolve_request", "examine_live_page"],
    );
    assert.ok(
      r.result.tools.every((x) => x.inputSchema.additionalProperties === false),
    );
    r = await call("tools/call", {
      name: "read_panel_image",
      arguments: { projectPath: file, panelId: "P02" },
    });
    assert.equal(r.result.content[1].type, "image");
    assert.equal(r.result.content[1].mimeType, "image/webp");
    assert.ok(r.result.content[1].data.length > 1000);
    r = await call("tools/call", {
      name: "update_panel",
      arguments: {
        projectPath: file,
        panelId: "P02",
        expectedRevision: 0,
        filePath: path.join(root, "assets/demo-originals/p02-after.png"),
        prompt: "Continue walking right.",
      },
    });
    assert.equal(r.result.isError, undefined);
    const updated = JSON.parse(await readFile(file));
    assert.equal(updated.revision, 1);
    assert.equal(updated.panels[1].versions.length, 2);
    assert.equal(updated.panels[1].approved, false);
    assert.deepEqual(updated.panels[1].checks, []);
    r = await call("tools/call", {
      name: "update_panel",
      arguments: {
        projectPath: file,
        panelId: "P02",
        expectedRevision: 0,
        caption: "Stale",
      },
    });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /Revision conflict/);
    r = await call("tools/call", {
      name: "examine_page",
      arguments: {
        projectPath: file,
        imagePath: path.join(root, "assets/demo-originals/p01.png"),
      },
    });
    assert.equal(r.result.content[1].mimeType, "image/png");
    r = await call("tools/call", {
      name: "read_project",
      arguments: { projectPath: file },
    });
    assert.ok(!r.result.content[0].text.includes("data:image/"));
    assert.equal(stderr, "");
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});
