import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { iterateTorrentUpdates } from "./qbittorent.poller";
import {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
	qbittorentService,
} from "./qbittorent.service";

export const qbittorentRouter = router({
	list: protectedProcedure.query(async () => {
		return qbittorentService.getTorrents();
	}),

	listUpdates: protectedProcedure.subscription(async function* (opts) {
		yield* iterateTorrentUpdates(opts.signal);
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
				await qbittorentService.addFromTracker(
					input.torrentFileUrl,
					input.mediaType,
				);
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
