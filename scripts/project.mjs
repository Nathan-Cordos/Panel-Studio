import { writeFile, readFile } from "node:fs/promises";
import { createDemo } from "../public/model.js";
import { readProject, updatePanel, projectSummary } from "../project-store.mjs";
const [command, file, patchFile] = process.argv.slice(2);
try {
  if (command === "create") {
    await writeFile(file, JSON.stringify(createDemo(), null, 2), {
      flag: "wx",
    });
    console.log("Demo project created.");
  } else if (command === "inspect")
    console.log(
      JSON.stringify(projectSummary(await readProject(file)), null, 2),
    );
  else if (command === "update")
    console.log(
      JSON.stringify(
        await updatePanel(file, JSON.parse(await readFile(patchFile, "utf8"))),
      ),
    );
  else
    throw new Error(
      "Usage: node scripts/project.mjs create|inspect PROJECT.json; update PROJECT.json PATCH.json",
    );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
