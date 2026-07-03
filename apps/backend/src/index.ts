import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { appRouter } from "./appRouter";
import { env } from "./utils/env";
import { logger } from "./utils/logger";

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

const server = createHTTPServer({
	router: appRouter,
	basePath: "/trpc/",
	allowBatching: true,
	onError({ error, path, type }) {
		logger.error({ err: error, path, type }, "tRPC request error");
	},
	middleware(req, res, next) {
		applyCorsHeaders(req, res);
		if (req.method === "OPTIONS") {
			res.statusCode = 204;
			res.end();
			return;
		}
		next();
	},
});

const wss = new WebSocketServer({ server });

applyWSSHandler({
	wss,
	router: appRouter,
	createContext: () => ({}),
	keepAlive: {
		enabled: true,
		pingMs: 30_000,
		pongWaitMs: 5_000,
	},
});

server.listen(env.PORT);

logger.info({ port: env.PORT }, "Server is running");
