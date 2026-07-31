import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { toNodeHandler } from "better-auth/node";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { existsSync } from "node:fs";
import { WebSocketServer } from "ws";
import { auth } from "./auth/auth";
import { appRouter } from "./appRouter";
import { createContext } from "./trpc/context";
import { runMigrations } from "./db/migrate";
import { tryServeStatic } from "./http/static";
import { ensureBucket } from "./storage/s3";
import { env } from "./utils/env";
import { logger } from "./utils/logger";

await runMigrations();

try {
	await ensureBucket();
} catch (err) {
	logger.warn({ err }, "MinIO bucket bootstrap failed; continuing without S3");
}

const staticDir = path.resolve(
	env.STATIC_DIR ?? path.join(import.meta.dir, "../public"),
);
const staticEnabled = existsSync(staticDir);

if (staticEnabled) {
	logger.info({ staticDir }, "Serving frontend static assets");
} else {
	logger.info(
		{ staticDir },
		"No frontend static dir; API-only (set STATIC_DIR or build public/)",
	);
}

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse) {
	res.setHeader("Access-Control-Allow-Origin", env.CORS_ORIGIN);
	res.setHeader("Access-Control-Allow-Credentials", "true");
	res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
	const requested = req.headers["access-control-request-headers"];
	res.setHeader(
		"Access-Control-Allow-Headers",
		typeof requested === "string" ? requested : "content-type",
	);
}

const authHandler = toNodeHandler(auth);

const server = createHTTPServer({
	router: appRouter,
	createContext,
	basePath: "/trpc/",
	allowBatching: true,
	onError({ error, path: rpcPath, type }) {
		logger.error({ err: error, path: rpcPath, type }, "tRPC request error");
	},
	middleware(req, res, next) {
		applyCorsHeaders(req, res);
		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.end();
			return;
		}
		const url = req.url ?? "";
		if (url.startsWith("/api/auth")) {
			return authHandler(req, res);
		}
		if (staticEnabled && tryServeStatic(req, res, staticDir)) {
			return;
		}
		next();
	},
});

const wss = new WebSocketServer({ server });

applyWSSHandler({
	wss,
	router: appRouter,
	createContext,
	keepAlive: {
		enabled: true,
		pingMs: 30_000,
		pongWaitMs: 5_000,
	},
});

server.listen(env.PORT);

logger.info({ port: env.PORT, staticEnabled }, "Server is running");
