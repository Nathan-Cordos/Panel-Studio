# Panel Studio: design case study

## Problem and intended user

An individual generated image can look convincing while breaking a sequence. A creative producer needs to check movement, subjects, props, crops and captions across shots, correct one image and retain the earlier version for comparison.

The fictional café sequence makes that problem visible: the subject approaches from the left, but the second shot sends her back the other way. The saved correction changes her pose while retaining the background orientation.

## Product decisions

- **Use a concrete four-shot example.** A reviewer can inspect a complete workflow without connecting an API account. Its correction is explicitly labelled as generated in advance.
- **Preserve sibling versions.** An edit does not destroy the original; selected-shot and page comparisons support different kinds of review.
- **Keep approval human.** Model findings are suggestions. Image, crop and caption changes reopen review, and the user checks the result before approving it.
- **Allow draft exports.** Exporting helps inspection outside the editor; the UI reports outstanding reviews rather than implying that export means approval.
- **Support files as well as the UI.** Portable JSON, revision checks and a small MCP server let Codex inspect and update the same project without a database or shared service.

## Technical implementation

The browser owns the working project and renders its page to a PNG canvas. A dependency-free local server forwards optional image edits and page reviews to OpenAI. The app persists named projects locally. MCP reads saved requests and references, returns native images and attaches revisions using a file lock and expected revision. The browser polls for saved revisions, protects unsaved edits and publishes a revision-labelled preview for inspection. Its tool surface deliberately excludes human approval.

## Demonstration

Inspect P02, choose **Load corrected example**, then **Compare**. Check the actor's feet and torso as well as the storefront. Return to the sheet, change the crop or caption, complete the checklist and save the JSON. Open the exported page to inspect the final composition.

## Evidence and next evaluation

[Validation](VALIDATION.md) records browser, API-contract, MCP and packaging checks. [The image manifest](../assets/movement-prompts.json) preserves the source prompts and findings. No live app quality benchmark or external usability study has been completed.

The strongest next evaluation would use several unseen sequences, with deliberately introduced direction, prop and crop errors. Measure which issues reviewers find, which model suggestions are wrong and whether users can recover an earlier version unaided. The current example demonstrates a repair workflow; it does not establish general continuity-detection accuracy.

Each local project contains one four-shot page, with reusable presets, project-specific criteria and reference roles. Saving a request does not launch Codex: the user initiates work in chat. Live results refresh automatically; the offline JSON workflow still requires reopening files. Generation quality, multi-page editing and external usability testing remain future evaluation work.
