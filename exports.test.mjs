import test from "node:test";
import assert from "node:assert/strict";
import { printGeometry } from "./public/exports.js";
import { pageSlots, sourceURL } from "./public/render.js";
test("print geometry preserves aspect ratio and separates trim, bleed and mark space", () => {
  const a = printGeometry("a4", 3, true);
  assert.equal(a.w, 210);
  assert.equal(a.h, 297);
  assert.equal(a.pad, 10);
  assert.equal(a.width, 230);
  assert.equal(a.height, 317);
  assert.ok(Math.abs(a.artWidth / a.artHeight - 1000 / 1532) < 1e-10);
  const l = printGeometry("letter", 0, false);
  assert.equal(l.width, 215.9);
  assert.equal(l.height, 279.4);
  assert.equal(l.pad, 0);
  const imperial = printGeometry("letter", 3.175, true);
  assert.equal(imperial.b / 25.4, 0.125);
  assert.ok(Math.abs(imperial.width - (215.9 + 2 * (3.175 + 7))) < 1e-9);
  assert.throws(() => printGeometry("a4", -1, true));
  for (const [x, y, w, h] of pageSlots("tidy")) {
    assert.ok(x >= 0 && y >= 0 && x + w <= 1000 && y + h <= 1532);
  }
  assert.equal(
    sourceURL("art/movement/p02-after.webp"),
    "/originals/p02-after.png",
  );
  assert.equal(
    sourceURL("data:image/png;base64,AA"),
    "data:image/png;base64,AA",
  );
});
