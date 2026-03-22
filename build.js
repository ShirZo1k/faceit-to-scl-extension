import * as esbuild from "esbuild";
import postcss from "postcss";
import fs from "fs";
import tailwindcss from "@tailwindcss/postcss";
import cssnano from "cssnano";
import buildManifest from "./manifest.js";

// List of files to build/copy
const sourceFiles = [
  "src/faceit/contentScript.ts",
  "src/faceit/web.tsx",
  "src/scl/contentScript.ts",
  "src/scl/extensionContentScript.ts",
  "src/serviceWorker.ts",
];
const staticFiles = {
  "icon.48.png": "icon.48.png",
  "icon.128.png": "icon.128.png",
  "src/extension/popup.html": "public/popup.html",
  "src/extension/intro.html": "public/intro.html",
};

// Setup build directory
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist");
fs.mkdirSync("dist/public");

await build("chrome");
await build("firefox");

async function build(browser) {
  const DEV = process.env.DEV === "true";

  fs.mkdirSync(`dist/${browser}`);
  fs.mkdirSync(`dist/${browser}/public`);

  fs.writeFileSync(
    `dist/${browser}/manifest.json`,
    JSON.stringify(buildManifest(browser), null, 2),
  );

  // Build source files
  await esbuild.build({
    entryPoints: sourceFiles,
    bundle: true,
    outdir: `dist/${browser}`,
    // Last 5 versions
    target: ["chrome130", "firefox131"],
    jsx: "automatic",
    minify: !DEV,
    sourcemap: DEV,
  });

  // Copy static files
  Object.entries(staticFiles).forEach(([source, destination]) => {
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, `dist/${browser}/${destination}`);
    }
  });

  // Build CSS and write
  async function buildCss(file) {
    const postcssPlugins = [
      tailwindcss(),
      !DEV && cssnano({ preset: "default" }),
    ];
    const postcssResult = await postcss(postcssPlugins.filter(Boolean)).process(
      fs.readFileSync(`src/${file}`),
      {
        from: `src/${file}`,
        to: `dist/${browser}/${file}`,
        map: DEV,
      },
    );
    fs.writeFileSync(`dist/${browser}/${file}`, postcssResult.css);
    if (postcssResult.map && DEV) {
      fs.writeFileSync(
        `dist/${browser}/${file}.map`,
        postcssResult.map.toString(),
      );
    }
  }

  // Build styles for FACEIT injection
  await buildCss("styles.inject.css");
  // Build styles for popup/intro tab
  await buildCss("styles.extension.css");
}
