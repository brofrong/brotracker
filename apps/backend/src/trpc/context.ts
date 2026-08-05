import type { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import type { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth";
import { parseAppLocale } from "../i18n/locale";

export async function createContext(
	opts: CreateHTTPContextOptions | CreateWSSContextFnOptions,
) {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(opts.req.headers),
	});
	const header = opts.req.headers["x-locale"];
	const locale = parseAppLocale(
		typeof header === "string" ? header : header?.[0],
	);
	return { session, locale };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
