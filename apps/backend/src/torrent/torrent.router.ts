import z from "zod";
import { publicProcedure, router } from "../trpc";
import { torrentService } from "./torrent.service";

export const torrentRouter = router({
	search: publicProcedure
		.input(
			z.object({
				search: z.string().optional(),
				source: z.enum(["local", "tracker"]).optional(),
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
			const searchText = input.search?.trim();
			const source = input.source;
			if (!searchText || !source) {
				return {
					source: (source ?? "local") as "local" | "tracker",
					results: [],
					totalResults: null,
				};
			}
			return torrentService.search(searchText, input.options, { source });
		}),
});
