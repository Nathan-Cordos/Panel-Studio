export function sourceURL(url) {
  return /^art\/movement\/(p01|p02-before|p02-after|p03|p04)\.webp$/.test(url)
    ? "/originals/" + url.split("/").pop().replace(".webp", ".png")
    : url;
}
export function pageSlots(layout) {
  if (layout === "grid")
    return [
      [32, 32, 460, 726],
      [508, 32, 460, 726],
      [32, 774, 460, 726],
      [508, 774, 460, 726],
    ];
  if (layout === "strips")
    return Array.from({ length: 4 }, (_, i) => [32, 32 + i * 371, 936, 355]);
  return layout === "rough"
    ? [
        [40, 32, 920, 360],
        [40, 414, 450, 235],
        [502, 414, 450, 235],
        [40, 690, 920, 590],
      ]
    : [
        [32, 32, 936, 468],
        [32, 516, 460, 500],
        [508, 516, 460, 500],
        [32, 1032, 936, 468],
      ];
}
export async function image(source) {
  const im = new Image();
  im.src = source;
  await im.decode();
  return im;
}
function fit(ctx, im, x, y, w, h, focal = 50) {
  const scale = Math.max(w / im.width, h / im.height),
    sw = w / scale,
    sh = h / scale;
  ctx.drawImage(
    im,
    ((im.width - sw) * focal) / 100,
    (im.height - sh) / 2,
    sw,
    sh,
    x,
    y,
    w,
    h,
  );
}
export async function panelPNG(panel) {
  const im = await image(panel.versions[panel.active].image),
    c = document.createElement("canvas");
  c.width = im.width;
  c.height = im.height;
  c.getContext("2d").drawImage(im, 0, 0);
  return c.toDataURL("image/png");
}
export async function pageCanvas(
  state,
  {
    width = 1000,
    layer = "all",
    panelId = null,
    ids = true,
    fullResolution = false,
  } = {},
) {
  state = structuredClone(state);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round(width * 1.532);
  const ctx = c.getContext("2d");
  ctx.scale(width / 1000, width / 1000);
  if (layer === "all") {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1000, 1532);
  }
  const rough = state.layout === "rough";
  const slots = pageSlots(state.layout);
  for (const [i, p] of state.panels.entries()) {
    if (panelId && panelId !== p.id) continue;
    let [x, y, w, h] = slots[i];
    if (layer !== "captions") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      fit(
        ctx,
        await image(
          fullResolution
            ? sourceURL(p.versions[p.active].image)
            : p.versions[p.active].image,
        ),
        x,
        y,
        w,
        h,
        p.focal,
      );
      ctx.restore();
      ctx.strokeStyle = "#3e4148";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
    if (ids && layer === "all") {
      ctx.font = "14px Segoe UI";
      ctx.fillStyle = "#fffffff0";
      ctx.fillRect(x + 12, y + 12, 35, 23);
      ctx.fillStyle = "#536361";
      ctx.fillText(p.id, x + 17, y + 29);
    }
    if (layer === "art") continue;
    ctx.font = "18px Segoe UI";
    const { lines, height, cy, boxWidth } = captionLayout(
      ctx,
      p.caption,
      slots[i],
      rough,
    );
    if (lines.length) {
      ctx.fillStyle = "#fffffff2";
      ctx.fillRect(x + 17, cy, boxWidth, height);
      ctx.fillStyle = "#333c3a";
      lines.forEach((l, n) => ctx.fillText(l, x + 29, cy + 27 + n * 25));
    }
  }
  return c;
}

export function captionLayout(ctx, caption, [x, y, w, h], rough) {
  ctx.font = "18px Segoe UI";
  const lines = [];
  let line = "";
  for (const word of caption.split(/\s+/).filter(Boolean)) {
    const next = (line ? line + " " : "") + word;
    if (ctx.measureText(next).width > w * 0.76 && line) {
      lines.push(line);
      line = "";
    }
    for (const char of (line ? " " : "") + word) {
      if (ctx.measureText(line + char).width > w * 0.76 && line) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  const height = lines.length * 25 + 20;
  const cy = rough ? y + h * 0.45 : y + h - height - 17;
  if (lines.length && (cy < y || cy + height > y + h))
    throw new Error(
      "A caption is too long for its panel. Shorten it before exporting.",
    );
  return {
    lines,
    height,
    cy,
    boxWidth: Math.min(
      w - 34,
      Math.max(0, ...lines.map((l) => ctx.measureText(l).width)) + 24,
    ),
  };
}
