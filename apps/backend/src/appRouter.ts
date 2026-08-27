import { homeRouter } from "./home/home.router";
import { personRouter } from "./person/person.router";
import { qbittorentRouter } from "./qbittorent/qbittorent.router";
import { settingsRouter } from "./settings/settings.router";
import { titleRouter } from "./title/title.router";
import { torrentRouter } from "./torrent/torrent.router";
import { protectedProcedure, router } from "./trpc";
import { workersRouter } from "./workers/workers.router";

export const appRouter = router({
	hello: protectedProcedure.query(() => "Hello, World!"),
	home: homeRouter,
	torrent: torrentRouter,
	qbittorent: qbittorentRouter,
	settings: settingsRouter,
	title: titleRouter,
	person: personRouter,
	workers: workersRouter,
});

export type AppRouter = typeof appRouter;
