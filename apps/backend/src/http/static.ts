import { createReadStream, existsSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".map": "application/json",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json",
};

function contentTypeFor(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

function safeJoin(root: string, requestPath: string): string | null {
	const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "/");
	const resolved = path.resolve(root, `.${decoded}`);
	const rootResolved = path.resolve(root);
	if (
		resolved !== rootResolved &&
		!resolved.startsWith(rootResolved + path.sep)
	) {
		return null;
	}
	return resolved;
}

function sendFile(
	res: ServerResponse,
	filePath: string,
	method: string,
	statusCode = 200,
): void {
	const stat = statSync(filePath);
	res.statusCode = statusCode;
	res.setHeader("Content-Type", contentTypeFor(filePath));
	res.setHeader("Content-Length", String(stat.size));
	if (method === "HEAD") {
		res.end();
		return;
	}
	createReadStream(filePath).pipe(res);
}

/**
 * Serves files from `publicDir` and falls back to index.html for SPA routes.
 * Returns true when the request was handled.
 */
export function tryServeStatic(
	req: IncomingMessage,
	res: ServerResponse,
	publicDir: string,
): boolean {
	const method = req.method ?? "GET";
	if (method !== "GET" && method !== "HEAD") {
		return false;
	}

	const urlPath = req.url ?? "/";
	if (urlPath.startsWith("/trpc") || urlPath.startsWith("/api/auth")) {
		return false;
	}

	if (!existsSync(publicDir) || !statSync(publicDir).isDirectory()) {
		return false;
	}

	const joined = safeJoin(publicDir, urlPath);
	if (!joined) {
		res.statusCode = 400;
		res.end("Bad request");
		return true;
	}

	let filePath = joined;
	if (existsSync(filePath) && statSync(filePath).isDirectory()) {
		filePath = path.join(filePath, "index.html");
	}

	if (existsSync(filePath) && statSync(filePath).isFile()) {
		sendFile(res, filePath, method);
		return true;
	}

	const hasExtension = path.extname(path.basename(urlPath.split("?")[0] ?? "")) !== "";
	if (hasExtension) {
		return false;
	}

	const spaIndex = path.join(publicDir, "index.html");
	if (existsSync(spaIndex) && statSync(spaIndex).isFile()) {
		sendFile(res, spaIndex, method);
		return true;
	}

	const shell = path.join(publicDir, "_shell.html");
	if (existsSync(shell) && statSync(shell).isFile()) {
		sendFile(res, shell, method);
		return true;
	}

	return false;
}
