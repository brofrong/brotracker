import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	addFromTracker,
} from "./qbittorent.service";
import {
	getFreeSpaceOnDisk,
	getTorrents,
} from "./qbittorent.client";
import { iterateTorrentUpdates } from "./qbittorent.poller";
import { toLiveTorrents } from "./live-torrent";

export const qbittorentRouter = router({
	list: protectedProcedure.query(async () => {
		return toLiveTorrents(await getTorrents());
	}),

	freeSpace: protectedProcedure.query(async () => {
		const freeSpaceOnDisk = await getFreeSpaceOnDisk();
		return { freeSpaceOnDisk };
	}),

	listUpdates: protectedProcedure.subscription(async function* (opts) {
		for await (const torrents of iterateTorrentUpdates(opts.signal)) {
			yield toLiveTorrents(torrents);
		}
	}),

	add: protectedProcedure
		.input(
			z.object({
				torrentFileUrl: z.string().url(),
				mediaType: z.enum(["films", "tv"]),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				await addFromTracker(input.torrentFileUrl, input.mediaType);
			} catch (error) {
				if (error instanceof AddFromTrackerPreconditionError) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: error.message,
					});
				}
				if (error instanceof AddFromTrackerGatewayError) {
					throw new TRPCError({
						code: "BAD_GATEWAY",
						message: error.message,
					});
				}
				throw error;
			}

			return { ok: true as const };
		}),
});
