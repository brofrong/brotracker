import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rootPkg = JSON.parse(
	readFileSync(resolve(rootDir, "package.json"), "utf8"),
) as { version: string };

// Bake monorepo version into the client bundle (override via VITE_APP_VERSION).
if (!process.env.VITE_APP_VERSION) {
	process.env.VITE_APP_VERSION = rootPkg.version;
}

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
