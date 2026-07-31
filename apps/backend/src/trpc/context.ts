import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth";

export async function createContext(
	opts: CreateHTTPContextOptions | CreateWSSContextFnOptions,
) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(opts.req.headers),
	});
	return { session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
