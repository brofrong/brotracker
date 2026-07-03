import { initTRPC } from "@trpc/server";
import { logger } from "./utils/logger";

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.create();

const loggingMiddleware = t.middleware(async (opts) => {
	const start = Date.now();
	const log = logger.child({ path: opts.path, type: opts.type });

	log.debug("procedure started");

	const result = await opts.next();
	const durationMs = Date.now() - start;

	if (result.ok) {
		log.info({ durationMs }, "procedure completed");
	} else {
		log.warn(
			{
				durationMs,
				code: result.error.code,
				message: result.error.message,
			},
			"procedure failed",
		);
	}

	return result;
});

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure.use(loggingMiddleware);
