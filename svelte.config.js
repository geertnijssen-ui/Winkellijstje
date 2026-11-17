import adapter from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		serviceWorker: { register: false },
		version: { name: process.env.COMMIT_REF ?? String(Date.now()) }
	}
};

export default config;
