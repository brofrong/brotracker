import z from "zod";
import { publicProcedure, router } from "../trpc";
import { torrentService } from "./torrent.service";

export const torrentRouter = router({
	search: publicProcedure
		.input(
			z.object({
				search: z.string().optional(),
				force: z.boolean().optional().default(false),
				options: z
					.object({
						category: z.enum(["films", "tv"]).optional(),
						sortType: z
							.enum([
								"downloadsTimes",
								"themeName",
								"seedsCount",
								"leechesCount",
								"fileSize",
							])
							.optional(),
						sortOrder: z.enum(["ascending", "descending"]).optional(),
					})
					.default({}),
			}),
		)
		.query(async ({ input }) => {
			const searchText = input.search;
			if (!searchText) {
				return { source: "local" as const, results: [], totalResults: null };
			}
			return torrentService.search(searchText, input.options, {
				force: input.force,
			});
		}),
});
