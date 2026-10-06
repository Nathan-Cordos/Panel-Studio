import { liveTools, callLive } from "./live-mcp.mjs";
// Local stdio MCP. No API key or running web server is required for file tools.
import { createInterface } from "node:readline";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  readProject,
  updatePanel,
  projectSummary,
  imageType,
} from "./project-store.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
const str = { type: "string" },
  int = { type: "integer" };
const definitions = [
  [
    "read_project",
    "Read image briefs, version metadata and review state from an exported Panel Studio project. Does not include embedded image bytes.",
    { projectPath: str },
    ["projectPath"],
    true,
  ],
  [
    "read_panel_image",
    "Return the selected panel image as native image content for visual inspection. Specify versionIndex to compare an earlier revision.",
    { projectPath: str, panelId: str, versionIndex: int },
    ["projectPath", "panelId"],
    true,
  ],
  [
    "update_panel",
    "Update a saved panel or attach local artwork as a sibling version. Requires the current revision; clears approval. Save pending UI edits first, then reopen the updated JSON.",
    {
      projectPath: str,
      panelId: str,
      expectedRevision: int,
      filePath: str,
      prompt: str,
      label: str,
      beat: str,
      caption: str,
      focal: { type: "number", minimum: 0, maximum: 100 },
    },
    ["projectPath", "panelId", "expectedRevision"],
    false,
  ],
  [
    "examine_page",
    "Return an exported page PNG as native image content with its saved project briefs. Verify that the export belongs to the latest project; this tool does not certify export freshness or visual quality.",
    { projectPath: str, imagePath: str },
    ["projectPath", "imagePath"],
    true,
  ],
].map(([name, description, properties, required, readOnly]) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: readOnly,
    destructiveHint: false,
    openWorldHint: false,
  },
}));
definitions.push(...liveTools);
const text = (value) => ({
  type: "text",
  text: JSON.stringify(value, null, 2),
});
async function nativeImage(bytes) {
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Image exceeds 15 MB.");
  return {
    type: "image",
    mimeType: "image/" + imageType(bytes),
    data: bytes.toString("base64"),
  };
}
async function call(name, a) {
  const def = definitions.find((x) => x.name === name);
  if (!def) throw new Error("Unknown tool.");
  for (const k of def.inputSchema.required)
    if (a[k] === undefined) throw new Error("Missing " + k);
  for (const [k, v] of Object.entries(a)) {
    const spec = def.inputSchema.properties[k];
    if (!spec) throw new Error("Unknown field " + k);
    if (spec.type === "integer" ? !Number.isInteger(v) : typeof v !== spec.type)
      throw new Error("Invalid " + k);
  }
  if (liveTools.some((t) => t.name === name)) return callLive(name, a);
  if (name === "update_panel")
    return { content: [text(await updatePanel(a.projectPath, a))] };
  const p = await readProject(a.projectPath);
  if (name === "read_project") return { content: [text(projectSummary(p))] };
  if (name === "examine_page") {
    if ((await stat(a.imagePath)).size > 15 * 1024 * 1024)
      throw new Error("Export exceeds 15 MB.");
    const bytes = await readFile(a.imagePath);
    if (imageType(bytes) !== "png")
      throw new Error("Use the exported PNG page.");
    return {
      content: [
        text({
          revision: p.revision,
          panels: projectSummary(p).panels,
          review:
            "Inspect the actual image for movement, identity, props, crop and captions. Verify export freshness manually.",
        }),
        await nativeImage(bytes),
      ],
    };
  }
  const panel = p.panels.find((x) => x.id === a.panelId);
  if (!panel) throw new Error("Unknown panel.");
  const v = panel.versions[a.versionIndex ?? panel.active];
  if (!v) throw new Error("Unknown version.");
  const bytes = v.image.startsWith("data:")
    ? Buffer.from(v.image.split(",")[1], "base64")
    : await readFile(path.join(root, "public", v.image));
  return {
    content: [
      text({
        panelId: panel.id,
        brief: panel.beat,
        version: v.label,
        source: v.source,
        prompt: v.prompt || "",
      }),
      await nativeImage(bytes),
    ],
  };
}
async function dispatch(m) {
  if (m.method === "initialize")
    return {
      protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(
        m.params?.protocolVersion,
      )
        ? m.params.protocolVersion
        : "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "panel-studio", version: "1.2.0" },
    };
  if (m.method === "ping") return {};
  if (m.method === "tools/list") return { tools: definitions };
  if (m.method === "tools/call") {
    try {
      return await call(m.params?.name, m.params?.arguments || {});
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: e.message }] };
    }
  }
  throw new Error("Method not found.");
}
let queue = Promise.resolve();
createInterface({ input: process.stdin, crlfDelay: Infinity }).on(
  "line",
  (line) => {
    queue = queue.then(async () => {
      let m;
      try {
        m = JSON.parse(line);
        if (m.id === undefined) return;
        const result = await dispatch(m);
        process.stdout.write(
          JSON.stringify({ jsonrpc: "2.0", id: m.id, result }) + "\n",
        );
      } catch (e) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: m?.id ?? null,
            error: { code: m ? -32601 : -32700, message: e.message },
          }) + "\n",
        );
      }
    });
  },
);
