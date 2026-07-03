import { publicProcedure, router } from "../trpc";
import { iterateTorrentUpdates } from "./qbittorent.poller";
import { qbittorentService } from "./qbittorent.service";

export const qbittorentRouter = router({
	list: publicProcedure.query(async () => {
		return qbittorentService.getTorrents();
	}),

	listUpdates: publicProcedure.subscription(async function* (opts) {
		yield* iterateTorrentUpdates(opts.signal);
	}),
});
