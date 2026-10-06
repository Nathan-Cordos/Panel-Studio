// Original vector storyboards. No source story, prompts or reference assets are imported.
import { mkdir, writeFile } from "node:fs/promises";
const out = new URL("../public/art/", import.meta.url);
await mkdir(out, { recursive: true });
const base = (scene) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"><defs><pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".7" fill="#526461" opacity=".22"/></pattern><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#c6d7d5"/><stop offset="1" stop-color="#f1e9d9"/></linearGradient></defs><rect width="1000" height="600" fill="url(#sky)"/>${scene}<rect width="1000" height="600" fill="url(#grain)"/></svg>`;
const buildings = `<g fill="#91aaa5" stroke="#475e5c" stroke-width="3"><path d="M0 140h150v240H0zM165 85h180v300H165zM710 110h160v270H710zM882 175h118v205H882z"/><path d="M355 200h120v180H355zM600 150h100v230H600z" fill="#b0c2b6"/></g><g stroke="#d4dfce" stroke-width="13">${[25, 70, 115, 190, 245, 300, 735, 790, 845, 910, 955].map((x) => `<path d="M${x} 200v30m0 30v30m0 30v30"/>`).join("")}</g><path d="M0 382L1000 380v220H0z" fill="#798d8b"/><path d="M0 470L1000 440v160H0z" fill="#bcc9b7"/><path d="M0 506L1000 477" stroke="#e6e5ce" stroke-width="5"/>`;
const bike = (x, y, s = 1, flip = false) =>
  `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})" stroke="#283e3e" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"><g fill="none"><circle cx="-65" cy="55" r="48"/><circle cx="95" cy="55" r="48"/><path d="M-65 55l55-75 45 75h-100L-10-20h70l35 75M60-20l-8-24h20M-25-27h35"/></g><path d="M-10-35l23-95 55 20-28 56" fill="#ce855f"/><path d="M39-102l37 49 20 3M10-38l-21 45 42 50M6-24l49 24 7 47" fill="none"/><path d="M4-118l0-22 25-11 20 12-5 25" fill="#efd6b3"/><path d="M-1-135q18-42 53-3z" fill="#f0e9ce"/><path d="M29-114l10 0"/><rect x="-53" y="-102" width="38" height="49" rx="5" fill="#e2cd9f"/><path d="M-39-102v-13"/></g>`;
const scenes = {
  p01:
    buildings +
    `<path d="M430 385l80-75h55l80 75" fill="#b2c2b8" stroke="#526b65" stroke-width="3"/>` +
    bike(370, 405, 0.8) +
    `<path d="M600 440h120m-25-13 25 13-25 13" stroke="#e8ead5" stroke-width="4" fill="none"/>`,
  "p02-before": buildings + bike(570, 410, 1.35, true),
  "p02-after": buildings + bike(440, 410, 1.35),
  p03: `<path d="M0 320L1000 250v350H0" fill="#7e9390"/><g transform="translate(280 85) rotate(7)"><path d="M60 0h300l55 310H0z" fill="#d1b786" stroke="#405d57" stroke-width="7"/><path d="M60 0l50 90h190l60-90M110 90l-40 220M300 90l35 220" fill="none" stroke="#856e4f" stroke-width="5"/><rect x="120" y="135" width="140" height="95" fill="#eee6cd"/><path d="M140 160h95m-95 20h80m-80 20h90" stroke="#b5aa90" stroke-width="5"/></g><path d="M610 185l-50 43-175 50-35 40 30 43 200-65 88-80" fill="#e8d1ac" stroke="#405d57" stroke-width="6"/><path d="M645 155l-60 65 63 59 105-77" fill="#c9815e" stroke="#405d57" stroke-width="6"/><path d="M0 485h1000M0 515h1000" stroke="#bcc9b5" stroke-width="4"/>`,
  p04:
    `<rect y="170" width="1000" height="430" fill="#a0b5aa"/><path d="M0 410h1000v190H0" fill="#7b918a"/><rect x="690" y="105" width="220" height="375" fill="#d8d3b5" stroke="#49615b" stroke-width="5"/><rect x="735" y="180" width="130" height="295" fill="#536d64"/><path d="M723 120h155v45H723" fill="#cd956c"/><g fill="#d8dfc6" stroke="#567568" stroke-width="3"><rect x="30" y="220" width="140" height="115"/><rect x="220" y="220" width="140" height="115"/></g>` +
    bike(520, 423, 0.9) +
    `<path d="M0 505h1000" stroke="#d3d7bb" stroke-width="4"/>`,
};
for (const [name, scene] of Object.entries(scenes))
  await writeFile(new URL(name + ".svg", out), base(scene));
