import { TRPCError } from "@trpc/server";
import z from "zod";
import {
	AddFromTrackerGatewayError,
	AddFromTrackerPreconditionError,
} from "../qbittorent/qbittorent.service";
import { protectedProcedure, router } from "../trpc";
import { TitleAddError, TitleWatchError, titleModule } from "./index";

const titleRefSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("tmdb"),
		kind: z.enum(["films", "tv"]),
		tmdbId: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("topic"),
		topicUrl: z.string().url(),
	}),
	z.object({
		type: z.literal("qb"),
		hash: z.string().min(1),
	}),
]);

function assertTitleId(id: string) {
	if (
		!id.startsWith("tmdb:") &&
		!id.startsWith("topic:") &&
		!id.startsWith("qb:")
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid title id",
		});
	}
}

export const titleRouter = router({
	resolve: protectedProcedure
		.input(titleRefSchema)
		.query(({ input }) => titleModule.resolve(input)),

	get: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.query(async ({ input }) => {
			assertTitleId(input.id);
			return titleModule.get({ id: input.id });
		}),

	torrents: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.query(async ({ input }) => {
			assertTitleId(input.id);
			return titleModule.torrents({ id: input.id });
		}),

	add: protectedProcedure
		.input(
			z.object({
				torrentFileUrl: z.string().url(),
				kind: z.enum(["films", "tv"]),
				topicUrl: z.string().url(),
				titleId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				return await titleModule.add(input);
			} catch (error) {
				if (error instanceof TitleAddError) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: error.message,
					});
				}
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
		}),

	setWatch: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				watch: z.enum(["tracking", "paused"]),
				topicUrl: z.string().url().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			assertTitleId(input.id);
			try {
				return await titleModule.setWatch(input);
			} catch (error) {
				if (error instanceof TitleWatchError) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: error.message,
					});
				}
				throw error;
			}
		}),

	checkNow: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(async ({ input }) => {
			assertTitleId(input.id);
			return titleModule.checkNow(input);
		}),
});
