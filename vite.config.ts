import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
	plugins: [react()],
	server: {
		port: 8090,
		strictPort: true
	},
	clearScreen: false,
	build: {
		outDir: 'dist',
		target: 'chrome110'
	}
});
