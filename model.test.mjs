import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  validateProject,
  approve,
  revise,
  reviewCategories,
} from "./public/model.js";
test("approval requires every review dimension; edits preserve originals and clear approval", () => {
  const p = createDemo().panels[0];
  assert.throws(() => approve(p));
  p.checks = [...reviewCategories];
  approve(p);
  assert.equal(p.approved, true);
  const original = p.versions[0];
  revise(p, { image: "art/p01.svg", label: "New", source: "test" });
  assert.equal(p.versions[0], original);
  assert.equal(p.approved, false);
  assert.deepEqual(p.checks, []);
});
test("portable project survives serialization and rejects unsafe artwork and false approvals", () => {
  const p = JSON.parse(JSON.stringify(createDemo()));
  assert.ok(validateProject(p));
  p.panels[0].versions[0].image = "https://tracker.invalid/image.png";
  assert.equal(validateProject(p), false);
  const q = createDemo();
  q.panels[0].approved = true;
  assert.equal(validateProject(q), false);
  q.panels[0].approved = false;
  q.panels[1].id = "P01";
  assert.equal(validateProject(q), false);
});
