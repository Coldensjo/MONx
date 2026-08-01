import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'src-tauri', 'target', 'release');
const ext = process.platform === 'win32' ? '.exe' : '';
const src = join(releaseDir, `monx${ext}`);
const dest = join(releaseDir, `monx-portable${ext}`);

if (!existsSync(src)) {
	console.error(`Release binary not found: ${src}`);
	console.error('Run "bun run tauri:build:portable" or "bun run tauri:build:all" first.');
	process.exit(1);
}

copyFileSync(src, dest);
console.log(`Portable executable: ${dest}`);
