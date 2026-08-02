import { TRPCError } from "@trpc/server";
import z from "zod";
import { titleModule } from "./index";
import { protectedProcedure, router } from "../trpc";

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

export const titleRouter = router({
	resolve: protectedProcedure
		.input(titleRefSchema)
		.query(({ input }) => titleModule.resolve(input)),

	get: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.query(async ({ input }) => {
			if (
				!input.id.startsWith("tmdb:") &&
				!input.id.startsWith("topic:") &&
				!input.id.startsWith("qb:")
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid title id",
				});
			}
			return titleModule.get({ id: input.id });
		}),
});
