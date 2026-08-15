// Copies repo-root `assets/` into this app's `public/` before dev/build.
//
// Repo layout is: <repo-root>/assets/  and  <repo-root>/web/ (this app,
// per the Vercel "Root Directory" setting pointing at `web`) — not
// `<repo-root>/web/assets/`. Next.js can only serve files that live
// inside *this app's* `public/`, so rather than asking you to manually
// duplicate every file into two places (guaranteed to drift out of sync),
// this runs automatically via the `prebuild`/`predev` npm script and
// mirrors them over on every build.
//
// Safe to run in environments that don't have a sibling `assets/` folder
// (e.g. a fresh checkout that hasn't added assets yet) — it just skips
// with a note instead of failing the build.
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assetsRoot = join(appRoot, '..', 'assets');
const publicRoot = join(appRoot, 'public');

// source subfolder -> destination subfolder under public/. `server-icons`
// is intentionally renamed to `space-icons` here (not in your source
// folder) to match the servers -> spaces rebrand without asking you to
// rename the actual files on disk.
const FOLDER_MAP = {
  avatars: 'avatars',
  badges: 'badges',
  illustrations: 'illustrations',
  'server-icons': 'space-icons',
};
// top-level files copied as-is
const ROOT_FILES = ['logo.svg'];

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

if (!existsSync(assetsRoot)) {
  console.log(`[copy-assets] no ../assets folder found next to this app (looked at ${assetsRoot}) — skipping.`);
  process.exit(0);
}

let copiedAny = false;
for (const [srcName, destName] of Object.entries(FOLDER_MAP)) {
  const srcDir = join(assetsRoot, srcName);
  if (existsSync(srcDir)) {
    copyDir(srcDir, join(publicRoot, destName));
    copiedAny = true;
    console.log(`[copy-assets] assets/${srcName}/ -> public/${destName}/`);
  }
}
for (const fileName of ROOT_FILES) {
  const srcFile = join(assetsRoot, fileName);
  if (existsSync(srcFile)) {
    mkdirSync(publicRoot, { recursive: true });
    copyFileSync(srcFile, join(publicRoot, fileName));
    copiedAny = true;
    console.log(`[copy-assets] assets/${fileName} -> public/${fileName}`);
  }
}

if (!copiedAny) {
  console.log('[copy-assets] found ../assets but none of the expected subfolders/files were in it — check assets/req.md against public/ASSETS.md.');
}
