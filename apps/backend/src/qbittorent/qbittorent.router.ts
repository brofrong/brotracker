import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { toLiveTorrents } from "./live-torrent";
import {
	deleteTorrent,
	getFreeSpaceOnDisk,
	getTorrents,
	pauseTorrent,
	resumeTorrent,
} from "./qbittorent.client";
import {
	iterateTorrentUpdates,
	refreshTorrentUpdates,
} from "./qbittorent.poller";
import {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	addFromTracker,
} from "./qbittorent.service";

const torrentIdInput = z.object({
	id: z.string().min(1),
});

const bulkTorrentIdsInput = z.object({
	ids: z.array(z.string().min(1)).min(1),
});

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

	pause: protectedProcedure
		.input(torrentIdInput)
		.mutation(async ({ input }) => {
			await pauseTorrent(input.id);
			await refreshTorrentUpdates();
			return { ok: true as const };
		}),

	pauseAll: protectedProcedure.mutation(async () => {
		await pauseTorrent("all");
		await refreshTorrentUpdates();
		return { ok: true as const };
	}),

	pauseMany: protectedProcedure
		.input(bulkTorrentIdsInput)
		.mutation(async ({ input }) => {
			await pauseTorrent(input.ids.join("|"));
			await refreshTorrentUpdates();
			return { ok: true as const };
		}),

	resume: protectedProcedure
		.input(torrentIdInput)
		.mutation(async ({ input }) => {
			await resumeTorrent(input.id);
			await refreshTorrentUpdates();
			return { ok: true as const };
		}),

	resumeAll: protectedProcedure.mutation(async () => {
		await resumeTorrent("all");
		await refreshTorrentUpdates();
		return { ok: true as const };
	}),

	resumeMany: protectedProcedure
		.input(bulkTorrentIdsInput)
		.mutation(async ({ input }) => {
			await resumeTorrent(input.ids.join("|"));
			await refreshTorrentUpdates();
			return { ok: true as const };
		}),

	delete: protectedProcedure
		.input(torrentIdInput)
		.mutation(async ({ input }) => {
			await deleteTorrent(input.id);
			await refreshTorrentUpdates();
			return { ok: true as const };
		}),

	deleteMany: protectedProcedure
		.input(bulkTorrentIdsInput)
		.mutation(async ({ input }) => {
			await deleteTorrent(input.ids.join("|"));
			await refreshTorrentUpdates();
			return { ok: true as const };
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
