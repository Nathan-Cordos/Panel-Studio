import path from "node:path";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { imageType, projectSummary } from "./project-store.mjs";
import { pageSlots } from "./public/render.js";
const str = { type: "string" },
  int = { type: "integer" };
const def = (name, description, properties, required, readOnly = true) => ({
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
});
export const liveTools = [
  def(
    "list_projects",
    "List projects saved in the running Panel Studio, including open-request counts.",
    {},
    [],
  ),
  def(
    "read_live_project",
    "Read the latest project, story, style, references, shot briefs, measured layout slots and requests. Embedded image bytes are omitted.",
    { projectId: str },
    ["projectId"],
  ),
  def(
    "read_live_image",
    "Inspect a panel version or project reference as native image content. Supply panelId or referenceId. Optional absolute outputPath saves a new local file for an image-generation tool; existing files are never overwritten.",
    {
      projectId: str,
      panelId: str,
      referenceId: str,
      versionIndex: int,
      outputPath: str,
    },
    ["projectId"],
    false,
  ),
  def(
    "resolve_request",
    "Claim, block or complete a saved request. Completion must attach local artwork or change a panel field. Uses expectedRevision; originals remain and human review reopens. The browser refreshes automatically when it has no unsaved changes.",
    {
      projectId: str,
      requestId: str,
      expectedRevision: int,
      status: { type: "string", enum: ["in_progress", "completed", "blocked"] },
      notes: str,
      filePath: str,
      prompt: str,
      label: str,
      caption: str,
      beat: str,
      focal: { type: "number" },
    },
    ["projectId", "requestId", "expectedRevision", "status", "notes"],
    false,
  ),
  def(
    "examine_live_page",
    "Inspect the current page rendered by the open editor. Returns only a preview matching the current saved revision. After an update allow the editor a few seconds to refresh.",
    { projectId: str },
    ["projectId"],
  ),
];
const text = (value) => ({
  type: "text",
  text: JSON.stringify(value, null, 2),
});
function base() {
  const url = new URL(process.env.PANEL_STUDIO_URL || "http://127.0.0.1:3741");
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
    throw new Error("PANEL_STUDIO_URL must use local http://127.0.0.1.");
  return url.origin;
}
async function api(route, body) {
  let response;
  try {
    response = await fetch(base() + "/api/projects" + route, {
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error("Start Panel Studio, then retry the live project tool.");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}
function native(data) {
  return {
    type: "image",
    mimeType: data.slice(5, data.indexOf(";")),
    data: data.split(",")[1],
  };
}
export async function callLive(name, a) {
  const id = encodeURIComponent(a.projectId || "");
  if (name === "list_projects") return { content: [text(await api(""))] };
  if (name === "resolve_request") {
    const { projectId, filePath, ...payload } = a;
    if (filePath) {
      if ((await stat(filePath)).size > 15 * 1024 * 1024)
        throw new Error("Use artwork smaller than 15 MB.");
      const bytes = await readFile(filePath);
      payload.image = `data:image/${imageType(bytes)};base64,${bytes.toString("base64")}`;
    }
    const p = await api("/" + id + "/resolve", payload);
    return {
      content: [
        text({
          revision: p.revision,
          request: p.requests.find((r) => r.id === a.requestId),
          review: "pending",
        }),
      ],
    };
  }
  if (name === "examine_live_page") {
    const preview = await api("/" + id + "/preview");
    return {
      content: [
        text({
          revision: preview.revision,
          review:
            "Inspect composition, continuity, crop and captions. Human approval remains separate.",
        }),
        native(preview.image),
      ],
    };
  }
  const p = await api("/" + id);
  if (name === "read_live_project") {
    const summary = projectSummary(p);
    summary.panels.forEach((panel, i) => {
      const [x, y, width, height] = pageSlots(p.layout)[i];
      panel.slot = {
        x,
        y,
        width,
        height,
        ratio: width / height,
        pageWidth: 1000,
        pageHeight: 1532,
      };
    });
    return { content: [text(summary)] };
  }
  let source, description;
  if (a.referenceId) {
    const ref = p.references?.find((r) => r.id === a.referenceId);
    if (!ref) throw new Error("Unknown reference.");
    source = ref.image;
    description = { name: ref.name, role: ref.role };
  } else {
    const panel = p.panels.find((x) => x.id === a.panelId);
    if (!panel) throw new Error("Supply a valid panelId or referenceId.");
    const v = panel.versions[a.versionIndex ?? panel.active];
    if (!v) throw new Error("Unknown version.");
    source = v.image;
    description = {
      panelId: panel.id,
      brief: panel.beat,
      source: v.source,
      prompt: v.prompt,
    };
  }
  if (!source.startsWith("data:")) {
    const response = await fetch(base() + "/" + source);
    if (!response.ok) throw new Error("Image unavailable.");
    const bytes = Buffer.from(await response.arrayBuffer());
    source = `data:image/${imageType(bytes)};base64,${bytes.toString("base64")}`;
  }
  if (a.outputPath) {
    if (!path.isAbsolute(a.outputPath))
      throw new Error("Use an absolute outputPath in your working directory.");
    await mkdir(path.dirname(a.outputPath), { recursive: true });
    await writeFile(a.outputPath, Buffer.from(source.split(",")[1], "base64"), {
      flag: "wx",
    });
    description.outputPath = a.outputPath;
  }
  return { content: [text(description), native(source)] };
}
