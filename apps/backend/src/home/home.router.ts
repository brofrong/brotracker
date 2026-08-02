import z from "zod";
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
		.query(async ({ input }) => home.compose(input)),
});
