import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The landing screen shows the version, and there is only one place it can come
// from without drifting: the manifest the build already reads.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	plugins: [react()],
	define: { __APP_VERSION__: JSON.stringify(pkg.version) },
	server: {
		port: 8090,
		strictPort: true,
		// Never walk into the Rust build tree: cargo holds locks on target/**,
		// and watching a live .dll aborts the dev server with EBUSY on Windows.
		watch: {
			ignored: ['**/src-tauri/**', '**/SPRx/**']
		}
	},
	clearScreen: false,
	// The F2 UI inspector reads component names off the React fibers; without
	// this they are mangled to single letters in release builds.
	esbuild: { keepNames: true },
	build: {
		outDir: 'dist',
		target: 'chrome110'
	}
});
