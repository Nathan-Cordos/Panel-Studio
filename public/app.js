import { setupWorkspace } from "./workspace.js";
import { pageSlots } from "./render.js";
import { image, panelPNG, pageCanvas } from "./render.js";
import { setupExports } from "./exports.js";
import {
  createDemo,
  normalizeProject,
  defaultCriteria,
  invalidate,
  revise,
  approve,
  reviewCategories,
  validateProject,
} from "./model.js";
const $ = (id) => document.getElementById(id);
let project = createDemo(),
  key = "",
  busy = false;
let workspace;
let comparisonSerial = 0;
const selected = () => project.panels.find((p) => p.id === project.selected);
function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function changed() {
  project.revision++;
  workspace?.markDirty();
  render();
  if (!$("comparison").hidden)
    refreshComparison().catch((e) => status(e.message, true));
}
function render() {
  const p = selected();
  workspace?.meta();
  $("instruction").value = p.instruction || "";
  $("shotTitle").value = p.title;
  $("shotBrief").value = p.beat;
  $("shotType").value = p.shotType || "Medium";
  renderShotReferences();
  $("page").className = "page " + project.layout;
  $("page").replaceChildren();
  project.panels.forEach((panel, i) => {
    const b = document.createElement("button");
    b.className =
      "panel" +
      (p.id === panel.id ? " selected" : "") +
      (panel.approved ? " approved" : "");
    b.dataset.panel = panel.id;
    const [x, y, w, h] = pageSlots(project.layout)[i];
    Object.assign(b.style, {
      left: x / 10 + "%",
      top: y / 15.32 + "%",
      width: w / 10 + "%",
      height: h / 15.32 + "%",
      transform: "none",
    });
    b.setAttribute("aria-label", panel.id + ": " + panel.title);
    b.setAttribute("aria-pressed", String(p.id === panel.id));
    const im = document.createElement("img");
    im.src = panel.versions[panel.active].image;
    im.alt = panel.beat;
    im.style.objectPosition = panel.focal + "% 50%";
    const id = document.createElement("span");
    id.className = "id";
    id.textContent = panel.id;
    const caption = document.createElement("span");
    caption.className = "caption";
    caption.textContent = panel.caption;
    b.append(im, id, caption);
    if (panel.versions[panel.active].source === "placeholder") {
      const note = document.createElement("span");
      note.className = "placeholder-note";
      note.textContent = panel.title + " · awaiting artwork";
      b.append(note);
    }
    b.onclick = () => {
      project.selected = panel.id;
      render();
      if (matchMedia("(max-width: 800px)").matches)
        document.querySelector("aside").scrollIntoView({ block: "start" });
      if (!$("comparison").hidden)
        refreshComparison().catch((e) => status(e.message, true));
    };
    $("page").append(b);
  });
  $("panelId").textContent = p.id;
  $("panelTitle").textContent = p.title;
  $("panelBeat").textContent = p.beat;
  $("selectedIssue").textContent =
    project.isDemo && p.id === "P02" && p.active === 0
      ? "Draft issue: she walks left. The sequence should continue right."
      : "";
  $("selectedIssue").hidden = !$("selectedIssue").textContent;
  $("caption").value = p.caption;
  $("focal").value = p.focal;
  $("pageState").textContent =
    project.layout === "rough"
      ? "Original draft"
      : "Contact sheet · " +
        project.panels.filter((x) => x.approved).length +
        "/4 approved";
  $("versions").replaceChildren();
  p.versions.forEach((v, i) => {
    const b = document.createElement("button");
    b.textContent = v.label;
    b.className = i === p.active ? "active" : "";
    b.title = v.prompt || v.source;
    b.onclick = () => {
      if (p.active !== i) {
        p.active = i;
        invalidate(p);
        changed();
      }
    };
    $("versions").append(b);
  });
  $("checks").replaceChildren();
  const labels = project.reviewCriteria || defaultCriteria;
  reviewCategories.forEach((category) => {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "checkbox";
    input.checked = p.checks.includes(category);
    input.onchange = () => {
      p.checks = p.checks.filter((x) => x !== category);
      if (input.checked) p.checks.push(category);
      p.approved = false;
      project.revision++;
      workspace?.markDirty();
      $("approve").textContent = "Approve image";
      document
        .querySelector(`[data-panel="${p.id}"]`)
        .classList.remove("approved");
      $("pageState").textContent =
        "Contact sheet · " +
        project.panels.filter((x) => x.approved).length +
        "/4 approved";
      $("geometry").textContent = $("geometry").textContent.replace(
        "approved",
        "pending",
      );
    };
    label.append(input, labels[category]);
    $("checks").append(label);
  });
  $("approve").textContent = p.approved ? "Image approved" : "Approve image";
  requestAnimationFrame(() => {
    const slot = document
      .querySelector(`[data-panel="${p.id}"]`)
      .getBoundingClientRect();
    $("geometry").textContent =
      `Slot ${(slot.width / slot.height).toFixed(2)}:1 · review ${p.approved ? "approved" : "pending"}`;
  });
}
$("caption").oninput = (e) => {
  selected().caption = e.target.value;
  invalidate(selected());
  changed();
  status("Caption changed. Panel review reopened.");
};
$("focal").oninput = (e) => {
  selected().focal = Number(e.target.value);
  invalidate(selected());
  changed();
  status("Crop changed. Panel review reopened.");
};
$("approve").onclick = () => {
  try {
    approve(selected());
    changed();
    status(
      selected().id +
        " approved by you. Further changes will reopen its review.",
    );
  } catch (e) {
    status(e.message, true);
  }
};
$("layout").onclick = () => {
  project.layout = "tidy";
  project.panels.forEach(invalidate);
  changed();
  status("Layout aligned. Check the new crops and lettering before approving.");
};
$("repair").onclick = () => {
  project.layout = "tidy";
  const p = project.panels[1];
  let i = p.versions.findIndex((v) => v.source === "saved generated edit");
  if (i < 0) {
    revise(p, {
      image: "art/movement/p02-after.webp",
      label: "Direction corrected",
      source: "saved generated edit",
      prompt:
        "Turn the whole walking pose to the right. Preserve identity, clothing, tote and storefront. Do not mirror the background.",
    });
  } else p.active = i;
  project.panels.forEach(invalidate);
  changed();
  showFindings(
    [
      {
        panel: "P02",
        category: "orientation",
        observation:
          "The original shot faces left, against the rightward movement established in P01.",
        suggestion:
          "The saved edit changes the whole walking pose to the right while keeping the storefront.",
      },
      {
        panel: "Page",
        category: "layout",
        observation:
          "The draft comparison has uneven gutters and captions across the action.",
        suggestion:
          "The corrected sheet aligns the panels and moves captions to the lower edge.",
      },
    ],
    "Example corrections · generated in advance",
  );
  status(
    "Corrected example loaded. Compare P02 versions, then complete the review.",
  );
};
$("rough").onclick = () => {
  project.layout = "rough";
  project.panels.forEach((p) => {
    p.active = 0;
    invalidate(p);
  });
  changed();
  $("findings").replaceChildren();
  status(
    "Original artwork and draft layout shown. All later artwork versions are preserved.",
  );
};
function showFindings(findings, summary) {
  $("findings").replaceChildren();
  const lead = document.createElement("p");
  lead.className = "muted";
  lead.textContent = summary;
  $("findings").append(lead);
  findings.forEach((f) => {
    const card = document.createElement("div");
    card.className = "finding";
    const strong = document.createElement("strong");
    strong.textContent = f.panel + " · " + f.category;
    const p = document.createElement("p");
    p.textContent = f.observation + " " + f.suggestion;
    card.append(strong, p);
    $("findings").append(card);
  });
}
async function refreshComparison() {
  const token = ++comparisonSerial,
    p = structuredClone(selected()),
    snapshot = structuredClone(project);
  const canvases = await Promise.all([
    pageCanvas({
      ...snapshot,
      layout: snapshot.isDemo ? "rough" : snapshot.layout,
      panels: snapshot.panels.map((panel) => ({ ...panel, active: 0 })),
    }),
    pageCanvas(snapshot),
  ]);
  if (token !== comparisonSerial) return;
  $("selectedBefore").src = p.versions[0].image;
  $("selectedAfter").src = p.versions[p.active].image;
  for (const [id, c] of [
    ["beforeCanvas", canvases[0]],
    ["afterCanvas", canvases[1]],
  ]) {
    $(id).width = c.width;
    $(id).height = c.height;
    $(id).getContext("2d").drawImage(c, 0, 0);
  }
}
$("compare").onclick = async () => {
  try {
    $("comparison").hidden = !$("comparison").hidden;
    if (!$("comparison").hidden) {
      await refreshComparison();
      $("comparison").scrollIntoView({ block: "start" });
      status(
        "Original draft beside the current page. The example correction is a saved generated edit.",
      );
    }
    $("compareTop").textContent = $("comparison").hidden
      ? "Compare"
      : "Close comparison";
    $("compareTop").setAttribute(
      "aria-expanded",
      String(!$("comparison").hidden),
    );
  } catch (e) {
    status(e.message, true);
  }
};
$("compareTop").onclick = () => $("compare").click();
document.querySelector(".nav-item.active").onclick = () => {
  $("comparison").hidden = true;
  $("compareTop").textContent = "Compare";
  $("compareTop").setAttribute("aria-expanded", "false");
  $("page").scrollIntoView({ block: "nearest" });
};
function download(blob, name) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
setupExports(() => structuredClone(project), status);
$("save").onclick = () =>
  download(
    new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }),
    "panel-studio-project.json",
  );
$("saveTop").onclick = () => $("save").click();
$("openTop").onclick = () => $("openProject").click();
$("open").onchange = async (e) => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 60 * 1024 * 1024)
      throw new Error("Use a project smaller than 60 MB.");
    const p = JSON.parse(await f.text());
    if (!validateProject(p))
      throw new Error("This is not a supported Panel Studio project.");
    project = normalizeProject(p);
    workspace.reset();
    render();
    if (!$("comparison").hidden) await refreshComparison();
    status("Project restored, including versions and review decisions.");
  } catch (e) {
    status(e.message, true);
  } finally {
    $("open").value = "";
  }
};
$("upload").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
      f.size > 15 * 1024 * 1024
    )
      throw new Error("Choose a PNG, JPEG or WebP smaller than 15 MB.");
    const data = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(f);
    });
    await image(data);
    revise(selected(), {
      image: data,
      label: "Upload " + selected().versions.length,
      source: "user upload",
    });
    changed();
    status("Artwork placed as a new version. Review reopened.");
  } catch (e) {
    status(e.message, true);
  } finally {
    $("upload").value = "";
  }
};
$("settingsButton").onclick = () => $("settings").showModal();
$("settings").querySelector("form").onsubmit = (event) => {
  if (event.submitter?.classList.contains("close")) return;
  key = $("apiKey").value.trim();
  status(
    key
      ? "API key set for this tab."
      : "Tab key cleared. A server key will be used if configured.",
  );
};
async function api(route, payload) {
  const r = await fetch("/api/" + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-openai-key": key } : {}),
    },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Request failed.");
  return d;
}
async function action(fn) {
  if (busy) return;
  busy = true;
  const controls = [
    ...document.querySelectorAll(
      "main button,main input,main textarea,.rail button,.rail input",
    ),
  ];
  controls.forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (e) {
    status(e.message, true);
  } finally {
    busy = false;
    controls.forEach((b) => (b.disabled = false));
  }
}
async function generate(edit) {
  const panel = selected(),
    revision = project.revision;
  const instruction = $("instruction").value.trim();
  if (!instruction) return status("Enter an edit instruction first.", true);
  await action(async () => {
    status(edit ? "Generating an image revision…" : "Generating a new image…");
    const slot = document
      .querySelector(`[data-panel="${panel.id}"]`)
      .getBoundingClientRect();
    const d = await api("image", {
      prompt:
        "Sequence: " +
        project.story +
        "\nArt direction: " +
        project.artStyle +
        "\nFraming: " +
        (panel.shotType || "Medium") +
        "\nShot: " +
        panel.beat +
        "\nRequested change: " +
        instruction,
      references: (project.references || [])
        .filter((r) => (panel.referenceIds || []).includes(r.id))
        .map((r) => ({ image: r.image, role: r.role, name: r.name })),
      ratio: slot.width / slot.height,
      ...(edit && panel.versions[panel.active].source !== "placeholder"
        ? { image: await panelPNG(panel) }
        : {}),
    });
    if (project.revision !== revision)
      throw new Error(
        "The project changed during generation. Retry from the current version.",
      );
    revise(panel, {
      image: d.image,
      label: "AI " + panel.versions.length,
      source: edit ? "OpenAI image edit" : "OpenAI image generation",
      prompt: d.prompt,
      createdAt: new Date().toISOString(),
    });
    changed();
    status("Revision ready. Compare versions and complete a visual review.");
  });
}
$("edit").onclick = () => generate(true);
$("generate").onclick = () => generate(false);
$("review").onclick = () =>
  action(async () => {
    status("Checking the contact sheet against the image briefs…");
    const c = await pageCanvas(project);
    const d = await api("review", {
      image: c.toDataURL("image/png"),
      context: {
        story: project.story,
        artStyle: project.artStyle,
        reviewCriteria: project.reviewCriteria,
        panels: project.panels.map((p) => ({
          id: p.id,
          brief: p.beat,
          caption: p.caption,
        })),
      },
    });
    project.reviewFindings = d;
    workspace.markDirty();
    showFindings(d.findings, d.summary + " · Suggestions for manual review");
    status(
      "Review suggestions ready. Check each observation against the images.",
    );
  });
window.panelStudio = {
  getProject: () => structuredClone(project),
  getPanelBrief: (panelId) => {
    const p = project.panels.find((x) => x.id === panelId);
    if (!p) throw new Error("Unknown panel.");
    const slot = document
        .querySelector(`[data-panel="${panelId}"]`)
        .getBoundingClientRect(),
      im = document.querySelector(`[data-panel="${panelId}"] img`),
      ratio = slot.width / slot.height,
      sourceRatio = im.naturalWidth / im.naturalHeight;
    return {
      panelId,
      revision: project.revision,
      brief: p.beat,
      caption: p.caption,
      geometry: {
        width: slot.width,
        height: slot.height,
        ratio,
        cropFraction: sourceRatio
          ? 1 - Math.min(sourceRatio / ratio, ratio / sourceRatio)
          : null,
      },
      reference: p.versions[p.active],
    };
  },
  renderPage: () => pageCanvas(project),
  applyProject: (p, expectedRevision) => {
    if (expectedRevision !== project.revision)
      throw new Error("Revision conflict: read the current project.");
    if (!validateProject(p)) throw new Error("Invalid project.");
    project = normalizeProject(structuredClone(p));
    workspace?.markDirty();
    project.revision = expectedRevision + 1;
    project.panels.forEach(invalidate);
    render();
    if (!$("comparison").hidden)
      refreshComparison().catch((e) => status(e.message, true));
  },
};
workspace = setupWorkspace(
  () => project,
  (p) => {
    project = p;
    $("findings").replaceChildren();
    if (p.reviewFindings)
      showFindings(p.reviewFindings.findings, p.reviewFindings.summary);
    render();
    if (!$("comparison").hidden)
      refreshComparison().catch((e) => status(e.message, true));
  },
  status,
  () => busy,
);
render();

$("backToSheet").onclick = () =>
  document.querySelector(".nav-item.active").click();
for (const label of document.querySelectorAll("label[role='button']")) {
  label.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      label.querySelector("input").click();
    }
  };
}

$("instruction").oninput = () => {
  selected().instruction = $("instruction").value;
  workspace.markDirty();
};
for (const [id, field] of [
  ["shotTitle", "title"],
  ["shotBrief", "beat"],
  ["shotType", "shotType"],
])
  $(id).oninput = () => {
    selected()[field] = $(id).value;
    invalidate(selected());
    changed();
  };
function renderShotReferences() {
  const container = $("shotReferences");
  container.replaceChildren();
  const refs = project.references || [];
  if (!refs.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Add references in Project settings.";
    container.append(p);
  }
  for (const ref of refs) {
    const label = document.createElement("label"),
      input = document.createElement("input");
    label.className = "reference-choice";
    input.type = "checkbox";
    input.checked = (selected().referenceIds || []).includes(ref.id);
    input.onchange = () => {
      const p = selected();
      p.referenceIds = (p.referenceIds || []).filter((id) => id !== ref.id);
      if (input.checked) p.referenceIds.push(ref.id);
      invalidate(p);
      changed();
    };
    const im = new Image();
    im.src = ref.image;
    im.alt = ref.name;
    label.append(input, im, ref.name + " · " + ref.role);
    container.append(label);
  }
}
