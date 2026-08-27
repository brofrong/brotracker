import { TRPCError } from "@trpc/server";
import z from "zod";
import { toTmdbLanguage } from "../i18n/locale";
import { protectedProcedure, router } from "../trpc";
import { personModule } from "./index";

export const personRouter = router({
	get: protectedProcedure
		.input(z.object({ tmdbId: z.number().int().positive() }))
		.query(async ({ ctx, input }) => {
			const result = await personModule.get({
				tmdbId: input.tmdbId,
				language: toTmdbLanguage(ctx.locale),
			});

			if (result.status === "error" || !result.person) {
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message: "Не удалось получить данные из TMDB.",
				});
			}

			return result.person;
		}),
});
