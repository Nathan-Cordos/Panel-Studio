import {
  createProject,
  createDemo,
  normalizeProject,
  defaultCriteria,
  invalidate,
} from "./model.js";
import { pageCanvas } from "./render.js";
const $ = (id) => document.getElementById(id);
async function request(route, method = "GET", body) {
  const r = await fetch("/api/projects" + route, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export function setupWorkspace(get, set, status, isBusy) {
  let savedRevision = null,
    dirty = false,
    saving = false,
    conflict = false,
    modalReferences = [],
    editing = false,
    previewSerial = 0,
    defaultDirectory = "",
    chosenDirectory = "",
    locationSerial = 0;
  const storageReady = fetch("/api/project-storage")
    .then((r) => r.json())
    .then((config) => {
      defaultDirectory = config.defaultDirectory;
      $("chooseProjectFolder").disabled = false;
      return config;
    });
  async function storageAction(route, body) {
    const r = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  async function showLocation(p) {
    const serial = ++locationSerial;
    await storageReady;
    const text = p.id
      ? "Saved at: " + (await request("/" + p.id + "/location")).filePath
      : "Not saved · default folder: " + defaultDirectory;
    if (serial === locationSerial) $("projectLocation").textContent = text;
  }
  function markDirty() {
    dirty = true;
    $("syncState").textContent = "Unsaved changes";
  }
  function meta() {
    const p = get();
    $("projectName").textContent = p.name || "Untitled sequence";
    $("projectHeading").textContent = p.name || "Sequence review";
    $("projectKind").textContent = p.isDemo
      ? "Example project"
      : "Your project";
    $("repair").hidden = !p.isDemo;
    $("rough").hidden = !p.isDemo;
    $("layout").hidden = !p.isDemo;
    $("projectContext").textContent =
      p.story ||
      "Define the sequence in Project settings, then write each shot brief.";
    renderRequests();
    showLocation(p).catch((e) => status(e.message, true));
  }
  function adopt(p) {
    if (p.id === get().id && p.panels.some((x) => x.id === get().selected))
      p.selected = get().selected;
    savedRevision = p.revision;
    dirty = false;
    conflict = false;
    set(normalizeProject(p));
    localStorage.setItem("panel-studio-project", p.id);
    $("syncState").textContent = "Saved locally · available to Codex";
    $("reloadProject").hidden = true;
    status(
      "Project loaded. Save a request, then ask Codex to resolve the pending work.",
    );
    publishPreview();
  }
  async function publishPreview() {
    const token = ++previewSerial,
      p = structuredClone(get());
    if (!p.id || dirty) return;
    try {
      const canvas = await pageCanvas(p);
      if (token !== previewSerial || dirty) return;
      await request("/" + p.id + "/preview", "POST", {
        revision: p.revision,
        image: canvas.toDataURL("image/png"),
      });
    } catch (e) {
      $("syncState").textContent =
        "Saved · page preview needs attention: " + e.message;
    }
  }
  async function save() {
    if (saving) throw new Error("A save is already in progress.");
    if (conflict)
      throw new Error(
        "Codex or another tab changed this project. Download your local JSON before loading the latest version.",
      );
    saving = true;
    const p = structuredClone(get()),
      snapshot = JSON.stringify(p);
    try {
      const result = p.id
        ? await request("/" + p.id, "PUT", {
            expectedRevision: savedRevision,
            project: p,
          })
        : await request("", "POST", { project: p });
      if (JSON.stringify(get()) === snapshot) adopt(result);
      else {
        get().id = result.id;
        savedRevision = result.revision;
        get().revision = result.revision;
        localStorage.setItem("panel-studio-project", result.id);
        markDirty();
      }
      return result;
    } catch (e) {
      if (e.message.includes("Revision conflict")) {
        conflict = true;
        $("reloadProject").hidden = false;
      }
      throw e;
    } finally {
      saving = false;
    }
  }
  async function safe(fn) {
    try {
      await fn();
    } catch (e) {
      status(e.message, true);
      if ($("projectDialog").open)
        $("projectFormError").textContent = e.message;
    }
  }
  $("saveChanges").onclick = () =>
    safe(async () => {
      await save();
      status("Project saved. Codex can read the latest briefs and references.");
    });
  $("queueRequest").onclick = () =>
    safe(async () => {
      const instruction = $("instruction").value.trim();
      if (!instruction)
        throw new Error("Write the change you want before saving a request.");
      const panelId = get().selected,
        p = await save();
      if (dirty)
        throw new Error(
          "The project changed during saving. Save the request again when your edits are finished.",
        );
      adopt(
        await request("/" + p.id + "/requests", "POST", {
          expectedRevision: p.revision,
          panelId,
          instruction,
        }),
      );
      status(
        "Request saved. Ask Codex to resolve this project’s pending requests.",
      );
    });
  $("codexBrief").onclick = () =>
    safe(async () => {
      const p = get();
      if (!p.id) throw new Error("Save the project or a request first.");
      await navigator.clipboard.writeText(
        `Use $panel-studio to resolve pending requests in live project ${p.id} (${p.name}). Use read_live_project, inspect the referenced images and adjacent shots, then resolve_request with sibling artwork and exact prompts. Inspect examine_live_page after the editor updates. Leave human approval to me. Panel Studio is running at ${location.origin}.`,
      );
      status(
        "Project request copied. Paste it into a Codex chat with the Panel Studio plugin enabled.",
      );
    });
  function renderRequests() {
    const p = get(),
      list = $("requestList");
    list.replaceChildren();
    const requests = (p.requests || [])
      .filter((r) => r.panelId === p.selected)
      .slice()
      .reverse();
    $("requestCount").textContent =
      (p.requests || []).filter((r) =>
        ["pending", "in_progress"].includes(r.status),
      ).length + " pending";
    for (const r of requests) {
      const card = document.createElement("div");
      card.className = "request-card";
      const label = document.createElement("strong");
      label.textContent = r.status.replace("_", " ");
      const text = document.createElement("p");
      text.textContent = r.instruction;
      card.append(label, text);
      if (r.notes) {
        const note = document.createElement("p");
        note.className = "muted";
        note.textContent = r.notes;
        card.append(note);
      }
      if (["pending", "blocked"].includes(r.status)) {
        const b = document.createElement("button");
        b.className = "text-button";
        b.textContent = "Cancel request";
        b.onclick = () =>
          safe(async () => {
            if (dirty) await save();
            adopt(
              await request("/" + get().id + "/resolve", "POST", {
                expectedRevision: savedRevision,
                requestId: r.id,
                status: "cancelled",
                notes: "Cancelled by the project owner.",
              }),
            );
          });
        card.append(b);
      }
      list.append(card);
    }
    if (!requests.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No requests saved for this shot.";
      list.append(p);
    }
  }
  function referenceList() {
    const list = $("projectReferences");
    list.replaceChildren();
    for (const ref of modalReferences) {
      const card = document.createElement("div");
      card.className = "reference-card";
      const im = new Image();
      im.src = ref.image;
      im.alt = ref.name;
      const name = document.createElement("input");
      name.value = ref.name;
      name.setAttribute("aria-label", "Reference name");
      name.oninput = () => (ref.name = name.value);
      const role = document.createElement("input");
      role.value = ref.role;
      role.placeholder = "What should this reference preserve?";
      role.setAttribute("aria-label", "Reference role");
      role.oninput = () => (ref.role = role.value);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button";
      remove.textContent = "Remove";
      remove.onclick = () => {
        modalReferences = modalReferences.filter((x) => x.id !== ref.id);
        referenceList();
      };
      card.append(im, name, role, remove);
      list.append(card);
    }
  }
  function showProjectForm(existing = false) {
    editing = existing;
    const p = existing
      ? get()
      : createProject({ name: "", story: "", artStyle: "", layout: "tidy" });
    chosenDirectory = defaultDirectory;
    $("saveFolderChoice").hidden = existing;
    $("saveFolder").textContent = chosenDirectory;
    $("projectFormTitle").textContent = existing
      ? "Project settings"
      : "New project";
    $("projectTitleInput").value = p.name || "";
    $("storyInput").value = p.story || "";
    $("styleInput").value = p.artStyle || "";
    $("layoutPreset").value = p.layout === "rough" ? "tidy" : p.layout;
    modalReferences = structuredClone(p.references || []);
    $("shotPlan").replaceChildren();
    p.panels.forEach((panel, i) => {
      const label = document.createElement("label");
      label.textContent = `Shot ${i + 1} · what happens?`;
      const textarea = document.createElement("textarea");
      textarea.id = "plan" + i;
      textarea.value = panel.beat;
      textarea.placeholder = [
        "Establish the subject and setting.",
        "Describe the next action.",
        "Show a detail or change.",
        "Describe the final moment.",
      ][i];
      textarea.maxLength = 12000;
      label.append(textarea);
      $("shotPlan").append(label);
    });
    for (const key of Object.keys(defaultCriteria))
      $("criterion-" + key).value =
        p.reviewCriteria?.[key] || defaultCriteria[key];
    referenceList();
    $("projectFormError").textContent = "";
    $("projectDialog").showModal();
    $("projectDialog").scrollTop = 0;
  }
  $("newProject").onclick = async () => {
    await storageReady;
    if (dirty)
      return status(
        "Save changes before starting another project. Download JSON is available as a separate backup.",
        true,
      );
    showProjectForm();
  };
  let browserMode = "folder",
    browserDirectory = "",
    browserParent = "",
    browseSerial = 0;
  async function browseFolder(directory) {
    const serial = ++browseSerial;
    $("folderBrowserError").textContent = "Loading folder…";
    $("useFolder").disabled = true;
    try {
      const r = await fetch(
        "/api/project-browse?directory=" + encodeURIComponent(directory),
        { signal: AbortSignal.timeout(10000) },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (serial !== browseSerial || !$("folderBrowser").open) return;
      browserDirectory = data.directory;
      browserParent = data.parent;
      $("browseFolderPath").value = data.directory;
      $("folderUp").disabled = data.parent === data.directory;
      $("folderEntries").replaceChildren();
      $("folderDrives").replaceChildren();
      for (const drive of data.drives) {
        const b = document.createElement("button");
        b.className = "quiet";
        b.textContent = drive;
        b.onclick = () => browseFolder(drive);
        $("folderDrives").append(b);
      }
      for (const entry of data.entries) {
        if (!entry.directory && browserMode === "folder") continue;
        const b = document.createElement("button");
        b.className = "folder-entry";
        b.textContent = (entry.directory ? "▸ " : "▦ ") + entry.name;
        b.onclick = () =>
          entry.directory
            ? browseFolder(entry.path)
            : openSelectedFile(entry.path);
        $("folderEntries").append(b);
      }
      if (!$("folderEntries").children.length)
        $("folderEntries").textContent =
          browserMode === "folder"
            ? "No subfolders. You can use this folder."
            : "No projects here. Choose another folder or import a JSON file.";
      $("folderBrowserError").textContent = "";
      $("useFolder").disabled = false;
    } catch (e) {
      if (serial === browseSerial) {
        $("folderBrowserError").textContent =
          e.name === "TimeoutError"
            ? "Folder access timed out. Enter another path and click Go."
            : "Cannot open this folder. " + e.message;
      }
    }
  }
  async function showFolderBrowser(mode) {
    await storageReady;
    browserMode = mode;
    $("folderBrowserTitle").textContent =
      mode === "folder" ? "Choose save folder" : "Open project";
    $("folderBrowserHelp").textContent =
      mode === "folder"
        ? "Browse to a folder, then choose Use this folder. You can also paste a folder path."
        : "Choose a project JSON file. The browser starts in the default save folder.";
    $("useFolder").hidden = mode !== "folder";
    $("folderBrowser").showModal();
    browseFolder(
      mode === "folder"
        ? chosenDirectory || defaultDirectory
        : defaultDirectory,
    );
  }
  async function openSelectedFile(filePath) {
    if (dirty) {
      $("folderBrowserError").textContent =
        "Save your changes before opening another project.";
      return;
    }
    $("folderBrowserError").textContent = "Opening project…";
    try {
      const result = await storageAction("/api/project-open", { filePath });
      adopt(result.project);
      $("folderBrowser").close();
    } catch (e) {
      $("folderBrowserError").textContent = e.message;
    }
  }
  $("chooseProjectFolder").onclick = () =>
    safe(() => showFolderBrowser("folder"));
  $("openProject").onclick = () =>
    safe(async () => {
      if (dirty)
        throw new Error("Save your changes before opening another project.");
      await showFolderBrowser("file");
    });
  $("closeFolderBrowser").onclick = () => {
    $("folderBrowser").close();
    browseSerial++;
  };
  $("browseFolderForm").onsubmit = (e) => {
    e.preventDefault();
    browseFolder($("browseFolderPath").value.trim());
  };
  $("folderUp").onclick = () => browseFolder(browserParent);
  $("useFolder").onclick = () => {
    chosenDirectory = browserDirectory;
    $("saveFolder").textContent = chosenDirectory;
    $("folderBrowser").close();
  };
  $("projectSettings").onclick = () => showProjectForm(true);
  $("stylePreset").onchange = () => {
    if ($("stylePreset").value) $("styleInput").value = $("stylePreset").value;
  };
  $("referenceFiles").onchange = () =>
    safe(async () => {
      for (const f of $("referenceFiles").files) {
        if (modalReferences.length >= 6)
          throw new Error("Use up to six project references.");
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
          f.size > 5 * 1024 * 1024
        )
          throw new Error("Use PNG, JPEG or WebP references under 5 MB each.");
        const data = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(f);
        });
        const im = new Image();
        im.src = data;
        await im.decode();
        modalReferences.push({
          id: crypto.randomUUID(),
          name: f.name,
          role: "Subject or style reference",
          image: data,
        });
      }
      referenceList();
      $("referenceFiles").value = "";
    });
  $("projectForm").onsubmit = async (e) => {
    e.preventDefault();
    if (isBusy() || saving) return;
    const button = $("submitProject");
    button.disabled = true;
    try {
      const old = get();
      const values = {
        name: $("projectTitleInput").value.trim(),
        story: $("storyInput").value.trim(),
        artStyle: $("styleInput").value.trim(),
        layout: $("layoutPreset").value,
      };
      if (!values.name) throw new Error("Name the project.");
      const next = editing
        ? { ...structuredClone(old), ...values }
        : createProject(values);
      next.references = modalReferences;
      next.reviewCriteria = Object.fromEntries(
        Object.keys(defaultCriteria).map((key) => [
          key,
          $("criterion-" + key).value.trim() || defaultCriteria[key],
        ]),
      );
      next.panels.forEach((panel, i) => {
        panel.beat = $("plan" + i).value;
        panel.referenceIds = (
          panel.referenceIds || modalReferences.map((r) => r.id)
        ).filter((id) => modalReferences.some((r) => r.id === id));
        if (!editing) panel.referenceIds = modalReferences.map((r) => r.id);
        invalidate(panel);
      });
      const result =
        editing && old.id
          ? await request("/" + old.id, "PUT", {
              expectedRevision: savedRevision,
              project: next,
            })
          : await request("", "POST", {
              project: next,
              directory: chosenDirectory || defaultDirectory,
            });
      adopt(result);
      $("projectDialog").close();
      status(
        "Project saved. Select a shot, add an instruction, then save a request for Codex.",
      );
    } catch (e) {
      $("projectFormError").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
  $("closeProject").onclick = () => $("projectDialog").close();
  $("projects").onclick = () =>
    safe(async () => {
      await storageReady;
      $("libraryLocation").textContent = "Default folder: " + defaultDirectory;
      const { projects } = await request("");
      const list = $("projectLibrary");
      list.replaceChildren();
      for (const p of projects) {
        const button = document.createElement("button");
        button.className = "project-card quiet";
        button.textContent = `${p.name} · ${p.pending} pending`;
        const location = document.createElement("small");
        location.className = "project-location";
        location.textContent = p.filePath;
        button.append(location);
        button.onclick = () =>
          safe(async () => {
            if (dirty)
              throw new Error(
                "Save changes before switching projects. Download JSON is available as a separate backup.",
              );
            adopt(await request("/" + p.id));
            $("libraryDialog").close();
          });
        list.append(button);
      }
      if (!projects.length)
        list.textContent =
          "No projects saved yet. Start a new project or save the example.";
      $("libraryDialog").showModal();
    });
  $("closeLibrary").onclick = () => $("libraryDialog").close();
  $("loadExample").onclick = () =>
    safe(async () => {
      if (dirty)
        throw new Error("Save your changes before loading the example.");
      adopt(await request("", "POST", { project: createDemo() }));
      $("libraryDialog").close();
      status("A separate example project has been created.");
    });
  $("reloadProject").onclick = () =>
    safe(async () => {
      if (
        !confirm(
          "Load the latest saved project? Unsaved local edits will be replaced. Download JSON first if you need to keep them.",
        )
      )
        return;
      adopt(await request("/" + get().id));
      status("Latest project loaded.");
    });
  async function poll() {
    if (saving || isBusy() || document.hidden || $("projectDialog").open)
      return;
    const p = get();
    if (!p.id) return;
    try {
      const remote = await request("/" + p.id + "/revision");
      if (remote.revision === savedRevision) return;
      if (dirty) {
        conflict = true;
        $("syncState").textContent =
          "Remote changes available · local edits kept";
        $("reloadProject").hidden = false;
        return;
      }
      adopt(await request("/" + p.id));
      status(
        "Project updated from Codex or another tab. Review the returned work.",
      );
    } catch {
      $("syncState").textContent =
        "Connection unavailable · local edits retained";
    }
  }
  setInterval(poll, 2000);
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  (async () => {
    try {
      const id = localStorage.getItem("panel-studio-project");
      if (id) adopt(await request("/" + id));
      else meta();
    } catch {
      localStorage.removeItem("panel-studio-project");
      meta();
    }
  })();
  return {
    markDirty,
    meta,
    save,
    adopt,
    poll,
    reset: () => {
      savedRevision = null;
      dirty = true;
      conflict = false;
      delete get().id;
      meta();
      markDirty();
    },
    publishPreview,
  };
}
