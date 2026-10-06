import { demoPanels } from "./demo.js";
export const reviewCategories = [
  "orientation",
  "continuity",
  "crop",
  "lettering",
];
export function createDemo() {
  return {
    schemaVersion: 1,
    name: "A walk to the café",
    story: "A woman walks along a storefront and arrives at the café doorway.",
    artStyle: "Natural lifestyle photography",
    isDemo: true,
    references: [],
    requests: [],
    reviewCriteria: { ...defaultCriteria },
    revision: 0,
    layout: "tidy",
    selected: "P02",
    panels: demoPanels.map(({ image, ...p }) => ({
      ...p,
      versions: [
        { image, label: "Original", source: "generated demo photograph" },
      ],
      active: 0,
      checks: [],
      approved: false,
    })),
  };
}
export function invalidate(panel) {
  panel.checks = [];
  panel.approved = false;
}
export function revise(panel, version) {
  panel.versions.push(version);
  panel.active = panel.versions.length - 1;
  invalidate(panel);
}
export function approve(panel) {
  if (panel.versions[panel.active].source === "placeholder")
    throw new Error("Add artwork before approving this shot.");
  if (!reviewCategories.every((x) => panel.checks.includes(x)))
    throw new Error("Complete all four visual checks before approving.");
  panel.approved = true;
}
export function validateProject(p) {
  if (
    p?.schemaVersion !== 1 ||
    !Number.isInteger(p.revision) ||
    p.revision < 0 ||
    !["rough", "tidy", "grid", "strips"].includes(p.layout) ||
    !Array.isArray(p.panels) ||
    p.panels.length !== 4
  )
    return false;
  if (
    p.name !== undefined &&
    (typeof p.name !== "string" || p.name.length > 200)
  )
    return false;
  for (const key of ["story", "artStyle"])
    if (
      p[key] !== undefined &&
      (typeof p[key] !== "string" || p[key].length > 12000)
    )
      return false;
  if (
    p.reviewCriteria &&
    !reviewCategories.every(
      (key) =>
        typeof p.reviewCriteria[key] === "string" &&
        p.reviewCriteria[key].length > 0 &&
        p.reviewCriteria[key].length <= 1000,
    )
  )
    return false;
  if (
    p.references !== undefined &&
    (!Array.isArray(p.references) ||
      p.references.length > 6 ||
      !p.references.every(
        (r) =>
          typeof r.id === "string" &&
          typeof r.name === "string" &&
          typeof r.role === "string" &&
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.image),
      ))
  )
    return false;
  if (
    p.requests !== undefined &&
    (!Array.isArray(p.requests) ||
      p.requests.length > 200 ||
      !p.requests.every(
        (r) =>
          typeof r.id === "string" &&
          typeof r.panelId === "string" &&
          typeof r.instruction === "string" &&
          [
            "pending",
            "in_progress",
            "completed",
            "blocked",
            "cancelled",
          ].includes(r.status),
      ))
  )
    return false;
  const ids = new Set();
  for (const panel of p.panels) {
    if (!/^P0[1-4]$/.test(panel.id) || ids.has(panel.id)) return false;
    ids.add(panel.id);
    if (
      !["title", "beat", "caption"].every(
        (k) => typeof panel[k] === "string",
      ) ||
      !Number.isFinite(panel.focal) ||
      panel.focal < 0 ||
      panel.focal > 100 ||
      !Array.isArray(panel.checks) ||
      !panel.checks.every((x) => reviewCategories.includes(x)) ||
      typeof panel.approved !== "boolean"
    )
      return false;
    if (
      panel.approved &&
      !reviewCategories.every((x) => panel.checks.includes(x))
    )
      return false;
    if (
      !Array.isArray(panel.versions) ||
      !panel.versions.length ||
      !Number.isInteger(panel.active) ||
      !panel.versions[panel.active]
    )
      return false;
    if (
      panel.referenceIds !== undefined &&
      (!Array.isArray(panel.referenceIds) ||
        !panel.referenceIds.every((id) =>
          p.references?.some((r) => r.id === id),
        ))
    )
      return false;
    for (const v of panel.versions)
      if (
        typeof v.label !== "string" ||
        typeof v.source !== "string" ||
        !(
          /^art\/(movement\/)?p0[1-4](-before|-after)?\.(svg|png|webp)$/.test(
            v.image,
          ) ||
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v.image)
        )
      )
        return false;
  }
  return ids.has(p.selected);
}

export const defaultCriteria = {
  orientation: "Composition and action match the shot brief",
  continuity: "Subjects, setting and style match the project references",
  crop: "Crop preserves the intended subject and action",
  lettering: "Caption is accurate, legible and clear of important detail",
};
export const placeholder =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
export function createProject({ name, story, artStyle, layout }) {
  return {
    schemaVersion: 1,
    revision: 0,
    name: name.trim(),
    story,
    artStyle,
    layout,
    selected: "P01",
    isDemo: false,
    references: [],
    requests: [],
    reviewCriteria: { ...defaultCriteria },
    panels: Array.from({ length: 4 }, (_, i) => ({
      id: `P0${i + 1}`,
      title: `Shot ${i + 1}`,
      beat: "",
      shotType: "Medium",
      caption: "",
      focal: 50,
      referenceIds: [],
      instruction: "",
      versions: [
        {
          image: placeholder,
          label: "Awaiting artwork",
          source: "placeholder",
        },
      ],
      active: 0,
      checks: [],
      approved: false,
    })),
  };
}
export function normalizeProject(p) {
  return {
    ...p,
    name: p.name || "Imported sequence",
    story: p.story || "",
    artStyle: p.artStyle || "",
    references: p.references || [],
    requests: p.requests || [],
    reviewCriteria: p.reviewCriteria || { ...defaultCriteria },
  };
}
