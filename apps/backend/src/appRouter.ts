import { homeRouter } from "./home/home.router";
import { qbittorentRouter } from "./qbittorent/qbittorent.router";
import { settingsRouter } from "./settings/settings.router";
import { titleRouter } from "./title/title.router";
import { torrentRouter } from "./torrent/torrent.router";
import { protectedProcedure, router } from "./trpc";

export const appRouter = router({
	hello: protectedProcedure.query(() => "Hello, World!"),
	home: homeRouter,
	torrent: torrentRouter,
	qbittorent: qbittorentRouter,
	settings: settingsRouter,
	title: titleRouter,
});

export type AppRouter = typeof appRouter;
