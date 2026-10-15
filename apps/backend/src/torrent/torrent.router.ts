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

/**
 * A tracker solving a Cloudflare challenge or logging in can take 5-10s; answer
 * with the trackers that are done and let the UI poll for the rest.
 */
const SEARCH_DEADLINE_MS = 8_000;

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
				return {
					results: [],
					totalResults: null,
					trackerFailures: [],
					pendingSources: [],
				};
			}
			return catalog.searchRefreshOrLocal(searchText, input.options, {
				deadlineMs: SEARCH_DEADLINE_MS,
			});
		}),
});
