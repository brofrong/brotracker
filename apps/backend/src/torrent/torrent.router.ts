import z from "zod";
import { catalog } from "../catalog";
import { protectedProcedure, router } from "../trpc";

const searchOptionsSchema = z
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
	.default({});

export const torrentRouter = router({
	search: protectedProcedure
		.input(
			z.object({
				search: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			const searchText = input.search?.trim();
			if (!searchText) {
				return { results: [], totalResults: null };
			}
			return catalog.search(searchText);
		}),

	recent: protectedProcedure
		.input(
			z
				.object({
					limit: z.number().int().min(1).max(100).optional(),
				})
				.optional(),
		)
		.query(async ({ input }) => {
			return catalog.listRecent(input?.limit ?? 50);
		}),

	searchRefresh: protectedProcedure
		.input(
			z.object({
				search: z.string().optional(),
				options: searchOptionsSchema,
			}),
		)
		.query(async ({ input }) => {
			const searchText = input.search?.trim();
			if (!searchText) {
				return { results: [], totalResults: null };
			}
			return catalog.searchRefresh(searchText, input.options);
		}),
});
