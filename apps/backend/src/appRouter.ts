import { qbittorentRouter } from "./qbittorent/qbittorent.router";
import { torrentRouter } from "./torrent/torrent.router";
import { publicProcedure, router } from "./trpc";

export const appRouter = router({
	hello: publicProcedure.query(() => "Hello, World!"),
	torrent: torrentRouter,
	qbittorent: qbittorentRouter,
});

export type AppRouter = typeof appRouter;
