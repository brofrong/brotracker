import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

const config = defineConfig({
	preview: {
		// Required for SPA prerender inside Docker (loopback bind).
		host: "127.0.0.1",
	},
	resolve: {
		tsconfigPaths: true,
		dedupe: [
			"react",
			"react-dom",
			"@tanstack/react-router",
			"@tanstack/react-query",
		],
	},
	plugins: [
		devtools(),
		tailwindcss(),
		tanstackStart({
			spa: {
				enabled: true,
				prerender: {
					outputPath: "/index.html",
				},
			},
		}),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	ssr: {
		noExternal: [/@astryxdesign\//],
	},
});

export default config;
