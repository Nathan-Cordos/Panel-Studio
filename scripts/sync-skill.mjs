import { cp, mkdir } from "node:fs/promises";
await mkdir(new URL("../skills/", import.meta.url), { recursive: true });
await cp(
  new URL("../.agents/skills/panel-studio/", import.meta.url),
  new URL("../skills/panel-studio/", import.meta.url),
  { recursive: true },
);
