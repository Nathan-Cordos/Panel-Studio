import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const json = async (file) =>
  JSON.parse(await readFile(new URL(file, import.meta.url), "utf8"));
test("plugin marketplace resolves package components and bundled skill matches repo skill", async () => {
  const plugin = await json("./plugin.json"),
    market = await json("./.agents/plugins/marketplace.json"),
    mcp = await json("./mcp.json"),
    legacy = await json("./.codex-plugin/plugin.json");
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(market.plugins[0].source.path, "./");
  assert.equal(legacy.version, plugin.version);
  assert.equal(mcp.mcpServers.panel_studio.type, "stdio");
  for (const file of [
    "mcp.mjs",
    "project-store.mjs",
    "public/model.js",
    "public/demo.js",
    "skills/panel-studio/SKILL.md",
  ])
    await access(new URL(file, import.meta.url));
  assert.equal(
    await readFile(
      new URL(".agents/skills/panel-studio/SKILL.md", import.meta.url),
      "utf8",
    ),
    await readFile(
      new URL("skills/panel-studio/SKILL.md", import.meta.url),
      "utf8",
    ),
  );
});
