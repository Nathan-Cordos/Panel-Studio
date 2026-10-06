import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  unlink,
  open,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  validateProject,
  normalizeProject,
  invalidate,
  revise,
} from "./public/model.js";
export const dataRoot = path.resolve(
  process.env.PANEL_STUDIO_DATA ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "projects"),
);
async function replaceFile(source, target) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(source, target);
    } catch (e) {
      if (attempt >= 5 || !["EPERM", "EACCES", "EBUSY"].includes(e.code))
        throw e;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
}
const registryPath = path.join(dataRoot, ".locations.json");
async function locations() {
  try {
    return JSON.parse(await readFile(registryPath, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}
async function register(id, target) {
  await mkdir(dataRoot, { recursive: true });
  const lock = await open(registryPath + ".lock", "wx");
  try {
    const entries = await locations();
    entries[id] = target;
    const temp = registryPath + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(entries));
    await replaceFile(temp, registryPath);
  } finally {
    await lock.close();
    await unlink(registryPath + ".lock");
  }
}
async function file(id) {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid project ID.");
  return (await locations())[id] || path.join(dataRoot, id + ".json");
}
export async function projectLocation(id) {
  return { directory: path.dirname(await file(id)), filePath: await file(id) };
}
export async function openLiveFile(target) {
  if (
    !path.isAbsolute(target) ||
    path.extname(target).toLowerCase() !== ".json"
  )
    throw new Error("Choose a project JSON file.");
  const bytes = await readFile(target);
  if (bytes.length > 60 * 1024 * 1024)
    throw new Error("Use a project smaller than 60 MB.");
  const p = JSON.parse(bytes);
  if (!validateProject(p))
    throw new Error("This is not a supported Panel Studio project.");
  // Existing live files retain identity and pending requests. Portable imports receive a new identity.
  if (!/^[a-z0-9-]{1,80}$/.test(p.id || ""))
    return createLive(p, path.dirname(target));
  const entries = await locations();
  const existing = entries[p.id] || path.join(dataRoot, p.id + ".json");
  if (path.resolve(existing) !== path.resolve(target)) {
    try {
      await readFile(existing);
      return createLive(p, path.dirname(target));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  await register(p.id, path.resolve(target));
  return normalizeProject(p);
}
export async function listProjects() {
  await mkdir(dataRoot, { recursive: true });
  const targets = new Set(Object.values(await locations()));
  for (const name of await readdir(dataRoot))
    if (name.endsWith(".json") && !name.startsWith("."))
      targets.add(path.join(dataRoot, name));
  const projects = [];
  for (const target of targets) {
    let p;
    try {
      p = JSON.parse(await readFile(target, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    projects.push({
      id: p.id,
      name: p.name,
      revision: p.revision,
      updatedAt: p.updatedAt,
      filePath: target,
      pending: (p.requests || []).filter((r) =>
        ["pending", "in_progress"].includes(r.status),
      ).length,
    });
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function readLive(id) {
  return JSON.parse(await readFile(await file(id), "utf8"));
}
async function write(fileName, p) {
  if (!validateProject(p)) throw new Error("Invalid project.");
  const json = JSON.stringify(p);
  if (Buffer.byteLength(json) > 60 * 1024 * 1024)
    throw new Error("Project exceeds 60 MB.");
  const temp = fileName + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temp, json);
    await replaceFile(temp, fileName);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function createLive(project, directory = dataRoot) {
  if (!path.isAbsolute(directory))
    throw new Error("Choose an absolute save folder.");
  await mkdir(directory, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  const p = normalizeProject(project);
  p.id = randomUUID();
  p.revision = 0;
  p.requests = [];
  p.updatedAt = new Date().toISOString();
  const target =
    path.resolve(directory) === dataRoot
      ? path.join(dataRoot, p.id + ".json")
      : path.join(
          directory,
          (p.name || "project").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70) +
            "-" +
            p.id.slice(0, 8) +
            ".panel-studio.json",
        );
  await write(target, p);
  if (path.dirname(target) !== dataRoot) await register(p.id, target);
  return p;
}
export async function mutateLive(id, expectedRevision, fn) {
  const target = await file(id);
  const lock = await open(target + ".lock", "wx").catch(() => {
    throw new Error("Project is being saved. Retry shortly.");
  });
  try {
    const p = await readLive(id);
    if (p.revision !== expectedRevision)
      throw new Error(
        "Revision conflict. Read the latest project before applying changes.",
      );
    await fn(p);
    p.revision++;
    p.updatedAt = new Date().toISOString();
    await write(target, p);
    return p;
  } finally {
    await lock.close();
    await unlink(target + ".lock");
  }
}
export async function saveLive(id, expectedRevision, candidate) {
  return mutateLive(id, expectedRevision, (p) => {
    const requests = p.requests,
      identity = p.id,
      revision = p.revision;
    Object.assign(p, normalizeProject(candidate), {
      id: identity,
      requests,
      revision,
    });
  });
}
export async function queueRequest(id, expectedRevision, panelId, instruction) {
  return mutateLive(id, expectedRevision, (p) => {
    if (!p.panels.some((x) => x.id === panelId))
      throw new Error("Unknown panel.");
    if (
      typeof instruction !== "string" ||
      !instruction.trim() ||
      instruction.length > 12000
    )
      throw new Error("Write a request of 1–12,000 characters.");
    p.requests.push({
      id: randomUUID(),
      panelId,
      instruction: instruction.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
      baseRevision: p.revision,
      notes: "",
    });
  });
}
export async function resolveRequest(id, expectedRevision, requestId, patch) {
  return mutateLive(id, expectedRevision, (p) => {
    const request = p.requests.find((r) => r.id === requestId);
    if (
      !request ||
      !["pending", "in_progress", "blocked"].includes(request.status)
    )
      throw new Error("Request is no longer open.");
    if (
      !["in_progress", "completed", "blocked", "cancelled"].includes(
        patch.status,
      )
    )
      throw new Error("Invalid request status.");
    if (typeof patch.notes !== "string" || !patch.notes.trim())
      throw new Error("Include a short result or progress note.");
    const panel = p.panels.find((x) => x.id === request.panelId);
    if (patch.status === "completed") {
      const hasEdit =
        patch.image ||
        ["caption", "beat", "focal"].some(
          (k) => patch[k] !== undefined && patch[k] !== panel[k],
        );
      if (!hasEdit)
        throw new Error(
          "Attach a revision or apply a specific panel change before completing a request.",
        );
      for (const k of ["caption", "beat", "focal"])
        if (patch[k] !== undefined) panel[k] = patch[k];
      if (patch.image) {
        if (!patch.prompt?.trim())
          throw new Error(
            "Keep the exact generation instruction with the revision.",
          );
        revise(panel, {
          image: patch.image,
          label: patch.label || "Codex revision",
          source: "Codex request",
          prompt: patch.prompt,
          createdAt: new Date().toISOString(),
        });
      }
      invalidate(panel);
    }
    request.status = patch.status;
    request.notes = patch.notes;
    request.updatedAt = new Date().toISOString();
    request.resultRevision = p.revision + 1;
  });
}
export async function savePreview(id, revision, image) {
  const p = await readLive(id);
  if (p.revision !== revision) throw new Error("Preview is stale.");
  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) ||
    image.length > 24 * 1024 * 1024
  )
    throw new Error("Invalid preview.");
  await writeFile(
    path.join(dataRoot, id + ".preview"),
    JSON.stringify({ revision, image }),
  );
}
export async function readPreview(id) {
  const p = await readLive(id);
  const preview = JSON.parse(
    await readFile(path.join(dataRoot, id + ".preview"), "utf8").catch(() => {
      throw new Error("Open this project in the editor to render its page.");
    }),
  );
  if (preview.revision !== p.revision)
    throw new Error(
      "The editor is still rendering this revision. Retry shortly with the project open.",
    );
  return preview;
}
