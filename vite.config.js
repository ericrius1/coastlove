import { defineConfig } from 'vite';

export default defineConfig( {
	// Relative paths work locally and under GitHub Pages' /coastlove/ project path.
	base: './',
	build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
	server: { port: 5188, strictPort: true, host: '127.0.0.1' },
} );
