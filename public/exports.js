import {
  pageCanvas,
  pageSlots,
  sourceURL,
  image,
  captionLayout,
} from "./render.js";

const $ = (id) => document.getElementById(id);
const mm = (value) => (value * 72) / 25.4;
const xml = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function printGeometry(size, bleed, marks) {
  const [w, h] = size === "letter" ? [215.9, 279.4] : [210, 297];
  const b = Number(bleed);
  if (![0, 3, 3.175, 5].includes(b))
    throw new Error("Choose a supported bleed.");
  const pad = b + (marks ? 7 : 0);
  const scale = Math.min(w / 1000, h / 1532);
  return {
    w,
    h,
    b,
    pad,
    width: w + pad * 2,
    height: h + pad * 2,
    artWidth: 1000 * scale,
    artHeight: 1532 * scale,
  };
}
function save(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const blob = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image export failed."))),
      "image/png",
    ),
  );
function lines(g) {
  const { pad: p, w, h, b } = g,
    segments = [];
  for (const x of [p, p + w])
    for (const y of [p, p + h]) {
      const dx = x === p ? -1 : 1,
        dy = y === p ? -1 : 1;
      segments.push([x + dx * (b + 2), y, x + dx * (b + 6), y]);
      segments.push([x, y + dy * (b + 2), x, y + dy * (b + 6)]);
    }
  return segments;
}
export async function printPDF(project, options) {
  const g = printGeometry(options.size, options.bleed, options.marks);
  const canvas = await pageCanvas(project, {
    width: Math.round((g.artWidth / 25.4) * 300),
    ids: false,
    fullResolution: true,
  });
  const pdf = await PDFLib.PDFDocument.create();
  pdf.setTitle("Panel Studio sequence");
  pdf.setSubject(
    `RGB review artwork; ${project.panels.filter((p) => p.approved).length}/4 images approved. White page border and white bleed. Not PDF/X.`,
  );
  pdf.setCreator("Panel Studio");
  const page = pdf.addPage([mm(g.width), mm(g.height)]);
  page.setTrimBox(mm(g.pad), mm(g.pad), mm(g.w), mm(g.h));
  page.setBleedBox(
    mm(g.pad - g.b),
    mm(g.pad - g.b),
    mm(g.w + g.b * 2),
    mm(g.h + g.b * 2),
  );
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(g.width),
    height: mm(g.height),
    color: PDFLib.rgb(1, 1, 1),
  });
  const art = await pdf.embedPng(await (await blob(canvas)).arrayBuffer());
  page.drawImage(art, {
    x: mm(g.pad + (g.w - g.artWidth) / 2),
    y: mm(g.pad + (g.h - g.artHeight) / 2),
    width: mm(g.artWidth),
    height: mm(g.artHeight),
  });
  if (options.marks)
    for (const [x1, y1, x2, y2] of lines(g))
      page.drawLine({
        start: { x: mm(x1), y: mm(y1) },
        end: { x: mm(x2), y: mm(y2) },
        thickness: 0.35,
        color: PDFLib.rgb(0, 0, 0),
      });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
export async function handoff(project, width) {
  const zip = new JSZip(),
    layout = {
      schemaVersion: 1,
      projectRevision: project.revision,
      width,
      height: Math.round(width * 1.532),
      units: "pixels",
      origin: "top-left",
      color: "RGB",
      layers: [],
      panels: [],
    };
  const slots = pageSlots(project.layout),
    factor = width / 1000;
  const portable = structuredClone(project);
  const captionSVG = [];
  const ctx = document.createElement("canvas").getContext("2d");
  for (const [i, p] of project.panels.entries()) {
    const active = p.versions[p.active],
      url = sourceURL(active.image);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot read ${p.id} artwork.`);
    const originalBlob = await response.blob(),
      im = await image(url);
    const ext = originalBlob.type.includes("jpeg")
      ? "jpg"
      : originalBlob.type.includes("webp")
        ? "webp"
        : originalBlob.type.includes("svg")
          ? "svg"
          : "png";
    const source = `sources/${p.id}.${ext}`;
    zip.file(source, originalBlob);
    // Embed every version so the saved project remains portable away from this server.
    for (const version of portable.panels[i].versions)
      if (!version.image.startsWith("data:")) {
        const r = await fetch(sourceURL(version.image));
        if (!r.ok) throw new Error("A project version could not be read.");
        let versionBlob = await r.blob();
        if (versionBlob.type.includes("svg")) {
          const sourceImage = await image(version.image);
          const raster = document.createElement("canvas");
          raster.width = sourceImage.width;
          raster.height = sourceImage.height;
          raster.getContext("2d").drawImage(sourceImage, 0, 0);
          versionBlob = await blob(raster);
        }
        version.image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(versionBlob);
        });
      }
    const [x, y, w, h] = slots[i],
      scale = Math.max(w / im.width, h / im.height),
      sw = w / scale,
      sh = h / scale;
    const artName = `layers/${p.id}-art.png`,
      captionName = `layers/${p.id}-caption.png`;
    zip.file(
      artName,
      await blob(
        await pageCanvas(project, {
          width,
          layer: "art",
          panelId: p.id,
          ids: false,
          fullResolution: true,
        }),
      ),
    );
    zip.file(
      captionName,
      await blob(
        await pageCanvas(project, {
          width,
          layer: "captions",
          panelId: p.id,
          ids: false,
        }),
      ),
    );
    layout.layers.push(artName, captionName);
    layout.panels.push({
      id: p.id,
      title: p.title,
      source,
      sourceWidth: im.width,
      sourceHeight: im.height,
      slot: {
        x: x * factor,
        y: y * factor,
        width: w * factor,
        height: h * factor,
      },
      sourceCrop: {
        x: ((im.width - sw) * p.focal) / 100,
        y: (im.height - sh) / 2,
        width: sw,
        height: sh,
      },
      caption: p.caption,
      approved: p.approved,
      version: active.label,
      prompt: active.prompt || null,
    });
    const {
      lines: wrapped,
      height,
      cy,
      boxWidth,
    } = captionLayout(ctx, p.caption, slots[i], project.layout === "rough");
    if (wrapped.length)
      captionSVG.push(
        `<g id="${p.id}"><rect x="${x + 17}" y="${cy}" width="${boxWidth}" height="${height}" fill="white" fill-opacity="0.95"/><text font-family="Segoe UI, sans-serif" font-size="18" fill="#333c3a">${wrapped.map((l, n) => `<tspan x="${x + 29}" y="${cy + 27 + n * 25}">${xml(l)}</tspan>`).join("")}</text></g>`,
      );
  }
  zip.file(
    "preview.png",
    await blob(
      await pageCanvas(project, { width, ids: false, fullResolution: true }),
    ),
  );
  zip.file(
    "captions.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${layout.height}" viewBox="0 0 1000 1532">${captionSVG.join("")}</svg>`,
  );
  zip.file("layout.json", JSON.stringify(layout, null, 2));
  const projectJSON = JSON.stringify(portable, null, 2);
  if (new Blob([projectJSON]).size > 60 * 1024 * 1024)
    throw new Error(
      "The embedded project exceeds the 60 MB project limit. Export the PNG or PDF instead, and retain your saved project.",
    );
  zip.file("project.json", projectJSON);
  zip.file(
    "README.txt",
    `PANEL STUDIO HANDOFF\n\nProject revision: ${project.revision}\nReview: ${project.panels.filter((p) => p.approved).length}/4 images approved\nCanvas: ${width} x ${layout.height} pixels, RGB\n\nPhotoshop: use File > Scripts > Load Files into Stack and choose the PNGs in layers/. Leave automatic alignment off. Each layer has the full canvas dimensions and is already positioned. Add a white background at the bottom. Place each caption above its corresponding art layer. Compare against preview.png.\n\nCaption PNGs are separate raster layers, not editable type. captions.svg retains text for vector editors; font substitution may affect spacing. Caption strings also appear in layout.json for retyping in Photoshop. No native PSD is included.\n\nsources/ contains selected artwork at its original available dimensions. layout.json records top-left pixel coordinates and crop rectangles in source pixels. project.json embeds all versions and can be reopened in Panel Studio.\n\nHigher output resolution does not create additional detail in the source images. This package has no CMYK conversion or printer ICC profile. Confirm printing requirements with the recipient.\n`,
  );
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 3 },
  });
}
export function setupExports(getProject, status) {
  let serial = 0,
    working = false;
  const options = () => ({
    size: $("paperSize").value,
    bleed: Number($("bleed").value),
    marks: $("cropMarks").checked,
  });
  async function preview() {
    const token = ++serial,
      format = $("exportFormat").value;
    $("printOptions").hidden = format !== "pdf";
    $("resolutionOptions").hidden = format === "pdf";
    $("exportDescription").textContent = {
      png: "A flattened image for presentations and screen sharing.",
      pdf: "A sized PDF with trim and bleed boxes. The white border extends into the bleed. RGB artwork; no CMYK conversion or PDF/X certification.",
      zip: "Original selected artwork, positioned transparent PNG layers, editable SVG captions, layout coordinates and a portable project.",
    }[format];
    const project = getProject(),
      c = await pageCanvas(project, { width: 600, ids: false });
    if (token !== serial) return;
    const out = $("exportPreview"),
      ctx = out.getContext("2d");
    const g = printGeometry(
      $("paperSize").value,
      Number($("bleed").value),
      $("cropMarks").checked,
    );
    out.width = 500;
    out.height =
      format === "pdf" ? Math.round((500 * g.height) / g.width) : 766;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, out.width, out.height);
    if (format === "pdf") {
      const f = 500 / g.width;
      ctx.drawImage(
        c,
        (g.pad + (g.w - g.artWidth) / 2) * f,
        (g.pad + (g.h - g.artHeight) / 2) * f,
        g.artWidth * f,
        g.artHeight * f,
      );
      if ($("cropMarks").checked) {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (const [a, b, d, e] of lines(g)) {
          ctx.moveTo(a * f, b * f);
          ctx.lineTo(d * f, e * f);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "#a24e3f";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(g.pad * f, g.pad * f, g.w * f, g.h * f);
    } else ctx.drawImage(c, 0, 0, out.width, out.height);
    const pending = project.panels.filter((p) => !p.approved).length;
    $("exportReview").textContent = pending
      ? `Draft · ${pending} of 4 images still need review.`
      : "All 4 images approved.";
    $("previewLegend").textContent =
      format === "pdf"
        ? `${g.w} × ${g.h} mm trim · ${g.b} mm white bleed · dashed trim guide is preview-only`
        : `${$("exportWidth").value} × ${Math.round(Number($("exportWidth").value) * 1.532)} pixels · RGB`;
    $("resolutionNote").textContent = "";
    if (format === "pdf") {
      const slots = pageSlots(project.layout);
      const ppi = [];
      for (const [i, p] of project.panels.entries()) {
        const im = await image(sourceURL(p.versions[p.active].image));
        const [, , w, h] = slots[i];
        const scale = Math.max(w / im.width, h / im.height);
        ppi.push(1 / scale / (g.artWidth / 1000 / 25.4));
      }
      if (token === serial)
        $("resolutionNote").textContent =
          `Page rendered at 300 ppi. Lowest source resolution after cropping: ${Math.floor(Math.min(...ppi))} ppi. Enlarging the export does not add image detail.`;
    }
  }
  $("export").onclick = () => {
    $("exportDialog").showModal();
    preview().catch((e) => {
      $("exportReview").textContent = e.message;
    });
  };
  for (const id of [
    "exportFormat",
    "paperSize",
    "bleed",
    "cropMarks",
    "exportWidth",
  ])
    $(id).onchange = () =>
      preview().catch((e) => {
        $("exportReview").textContent = e.message;
      });
  $("closeExport").onclick = () => {
    if (!working) $("exportDialog").close();
  };
  $("exportDialog").addEventListener("cancel", (e) => {
    if (working) e.preventDefault();
  });
  $("downloadExport").onclick = async () => {
    if (working) return;
    working = true;
    const controls = [
      ...$("exportDialog").querySelectorAll("button,select,input"),
    ];
    controls.forEach((c) => (c.disabled = true));
    const format = $("exportFormat").value,
      project = getProject();
    $("exportReview").textContent = "Preparing your export…";
    try {
      const width = Number($("exportWidth").value);
      const output =
        format === "pdf"
          ? await printPDF(project, options())
          : format === "zip"
            ? await handoff(project, width)
            : await blob(
                await pageCanvas(project, {
                  width,
                  ids: false,
                  fullResolution: true,
                }),
              );
      save(
        output,
        `panel-studio-${format === "zip" ? "handoff" : format === "pdf" ? "print" : "page"}.${format}`,
      );
      const note = project.panels.every((p) => p.approved)
        ? "Reviewed export downloaded."
        : "Draft export downloaded. Some images still need review.";
      $("exportReview").textContent = note;
      status(note);
    } catch (e) {
      $("exportReview").textContent = e.message;
      status(e.message, true);
    } finally {
      working = false;
      controls.forEach((c) => (c.disabled = false));
    }
  };
}
