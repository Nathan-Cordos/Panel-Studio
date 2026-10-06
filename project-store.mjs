import {
  readFile,
  writeFile,
  rename,
  unlink,
  open,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateProject, invalidate, revise } from "./public/model.js";
export async function readProject(file) {
  if (path.extname(file).toLowerCase() !== ".json")
    throw new Error("Use an exported project JSON file.");
  if ((await stat(file)).size > 60 * 1024 * 1024)
    throw new Error("Project exceeds 60 MB.");
  const p = JSON.parse(await readFile(file, "utf8"));
  if (!validateProject(p)) throw new Error("Invalid Panel Studio project.");
  return p;
}
export async function updatePanel(file, patch) {
  const lock = await open(file + ".lock", "wx").catch(() => {
    throw new Error(
      "Project is being updated. Retry after the current write completes.",
    );
  });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    const p = await readProject(file);
    if (patch.expectedRevision !== p.revision)
      throw new Error("Revision conflict. Read the current project.");
    const panel = p.panels.find((x) => x.id === patch.panelId);
    if (!panel) throw new Error("Unknown panel.");
    for (const field of ["beat", "caption", "focal"])
      if (patch[field] !== undefined) panel[field] = patch[field];
    if (patch.filePath) {
      if ((await stat(patch.filePath)).size > 15 * 1024 * 1024)
        throw new Error("Use an image smaller than 15 MB.");
      const bytes = await readFile(patch.filePath);
      if (bytes.length > 15 * 1024 * 1024)
        throw new Error("Use an image smaller than 15 MB.");
      const type = imageType(bytes);
      revise(panel, {
        image: `data:image/${type};base64,${bytes.toString("base64")}`,
        label: patch.label || "Codex revision",
        source: "Codex operator",
        prompt: patch.prompt || "",
        createdAt: new Date().toISOString(),
      });
    }
    invalidate(panel);
    p.revision++;
    if (!validateProject(p)) throw new Error("Invalid update.");
    await writeFile(temp, JSON.stringify(p, null, 2));
    await rename(temp, file);
    return { revision: p.revision, panelId: panel.id, review: "pending" };
  } finally {
    await lock.close();
    await unlink(file + ".lock");
    await unlink(temp).catch(() => {});
  }
}
export function imageType(bytes) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpeg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw new Error("Use a valid PNG, JPEG or WebP image.");
}
export function projectSummary(p) {
  return {
    ...p,
    references: (p.references || []).map(({ image, ...r }) => ({
      ...r,
      image: "[reference; use read_reference]",
    })),
    panels: p.panels.map((panel) => ({
      ...panel,
      versions: panel.versions.map((v) => ({
        ...v,
        image: v.image.startsWith("data:")
          ? "[embedded image; use read_panel_image]"
          : v.image,
      })),
    })),
  };
}
