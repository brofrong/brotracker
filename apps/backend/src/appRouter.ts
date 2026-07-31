import { qbittorentRouter } from "./qbittorent/qbittorent.router";
import { settingsRouter } from "./settings/settings.router";
import { torrentRouter } from "./torrent/torrent.router";
import { protectedProcedure, router } from "./trpc";

export const appRouter = router({
	hello: protectedProcedure.query(() => "Hello, World!"),
	torrent: torrentRouter,
	qbittorent: qbittorentRouter,
	settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
