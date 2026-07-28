import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
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
