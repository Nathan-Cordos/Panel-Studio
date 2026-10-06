---
name: panel-studio
description: Resolve saved Panel Studio image requests through its live MCP connection, using project briefs and references, preserving artwork versions, and returning results for human review.
---

Use the user's project story, art direction, shot briefs and reference roles. Keep new story or brand decisions labelled as proposals. Never import private story content into public examples.

## Live requests

Start Panel Studio and keep the project open in its editor. Saving a request queues work; the user then asks Codex to resolve it. Saving alone does not start a chat or generation.

1. Use `list_projects`, then `read_live_project` for the intended project. Read every pending request, project criteria, references and adjacent shot briefs. Use the measured slot dimensions when composing art.
2. Use `read_live_image` to OPEN the selected image, relevant references and neighbouring shots. Its optional absolute `outputPath` saves a new local file for the generation tool; use a project-owned directory and the returned MIME type's extension. Existing files cannot be overwritten. Empty placeholders are not identity references.
3. Claim one request with `resolve_request`, status `in_progress`, the latest `expectedRevision` and a short progress note. Process requests sequentially so revisions stay current.
4. Generate or edit with an available image-generation tool, supplying accepted references and their roles. Preserve the exact prompt. MCP attaches results; it does not generate images itself. If generation is unavailable, mark the request `blocked` with the reason. Never substitute fixture art and claim successful generation.
5. Complete with `resolve_request`, status `completed`, the local artwork `filePath`, exact `prompt` and factual result notes. Caption, shot brief (`beat`) and crop (`focal`) edits are also supported. The tool retains originals and reopens review. On revision conflicts, reread and reconcile; do not regenerate unnecessarily.
6. The open editor refreshes when it has no unsaved changes. Use `examine_live_page` and OPEN its native image. It returns only a preview matching the saved revision. Allow a few seconds for rendering; if the editor is closed or has unsaved changes, explain that it must be opened or saved before visual verification.

Check composition, action, camera geography, subject continuity, crops and captions against this project's instructions. Do not apply café-specific subjects, outfits or props to unrelated work. Keep lettering editable and outside generated art. A completed request is not human approval. Report each request as completed or blocked and describe any remaining visual issue.

## Portable files

For an exported JSON, use `read_project`, `read_panel_image` and `update_panel` with `expectedRevision`. File paths must be absolute and belong to the intended project. Reopen the updated JSON in the app after file edits. The equivalent CLI is `node scripts/project.mjs inspect PROJECT.json` or `update PROJECT.json PATCH.json`.

Use `examine_page` with an actual exported page PNG. Unlike live previews, offline PNG freshness must be checked manually. Human review remains separate; there is no approval tool.

## Delivery and demo accuracy

Screen PNG, RGB print PDF and editable handoff ZIP are supported. PDF includes trim/bleed boxes but is not PDF/X or ICC-converted. The ZIP contains positioned raster layers and editable SVG captions, not a native PSD.

The café example and its direction correction were generated in advance. Loading the correction is not a live model call. Preserve image versions, prompts and factual findings. Never claim paid API or model-quality validation from mocked responses or saved fixtures.
