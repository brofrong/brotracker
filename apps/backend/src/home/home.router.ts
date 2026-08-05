import z from "zod";
import { toTmdbLanguage } from "../i18n/locale";
import { protectedProcedure, router } from "../trpc";
import { home } from "./index";

export const homeRouter = router({
	compose: protectedProcedure
		.input(
			z.object({
				widgets: z.array(
					z.object({
						key: z.string(),
						widget: z.string(),
					}),
				),
			}),
		)
		.query(async ({ ctx, input }) =>
			home.compose({
				...input,
				language: toTmdbLanguage(ctx.locale),
			}),
		),
});
