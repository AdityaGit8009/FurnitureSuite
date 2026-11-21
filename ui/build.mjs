import { build } from "esbuild-wasm";
import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
const out = "../src/main/resources/static";
await mkdir(out, { recursive: true });
await cp("public", out, { recursive: true });
const { buildModels } = await import("./models.mjs");
await buildModels(out + "/models");
await build({
  entryPoints: ["@google/model-viewer"],
  bundle: true,
  minify: true,
  outfile: out + "/model-viewer.js",
  format: "esm",
  target: "es2020",
});
await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  outfile: out + "/studio.js",
  define: { "process.env.NODE_ENV": '"production"' },
  target: "es2020",
});
await writeFile(
  out + "/index.html",
  (await readFile("index.html", "utf8"))
    .replace('src="/src/main.jsx"', 'src="/studio.js"')
    .replace("</head>", '<link rel="stylesheet" href="/studio.css"></head>'),
);
