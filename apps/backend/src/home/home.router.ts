import { TRPCError } from "@trpc/server";
import z from "zod";
import { toTmdbLanguage } from "../i18n/locale";
import { protectedProcedure, router } from "../trpc";
import { home } from "./index";
import { getSpeedHistory, SPEED_HISTORY_MAX_DAYS } from "./transfer-history";

const dayString = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const DAY_MS = 86_400_000;

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

	speedHistory: protectedProcedure
		.input(
			z.object({
				from: dayString,
				to: dayString,
			}),
		)
		.query(async ({ input }) => {
			if (input.from > input.to) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "`from` must be on or before `to`",
				});
			}
			const spanDays =
				(Date.parse(`${input.to}T00:00:00Z`) -
					Date.parse(`${input.from}T00:00:00Z`)) /
					DAY_MS +
				1;
			if (spanDays > SPEED_HISTORY_MAX_DAYS) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Range must be at most ${SPEED_HISTORY_MAX_DAYS} days`,
				});
			}
			const days = await getSpeedHistory(input.from, input.to);
			return { days };
		}),
});
