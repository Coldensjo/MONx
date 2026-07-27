import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'src-tauri', 'target', 'release');
const src = join(releaseDir, 'sprx.exe');
const dest = join(releaseDir, 'sprx-portable.exe');

if (!existsSync(src)) {
	console.error(`Release binary not found: ${src}`);
	console.error('Run "bun run tauri:build:portable" or "bun run tauri:build:all" first.');
	process.exit(1);
}

copyFileSync(src, dest);
console.log(`Portable executable: ${dest}`);
