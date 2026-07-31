import { filmsCategories, tvCategories } from "./search-options";

export type MediaType = "films" | "tv";

export function detectMediaType(forumId: string): MediaType | null {
	const id = Number(forumId);
	if (!Number.isFinite(id)) return null;
	const inFilms = filmsCategories.includes(id);
	const inTv = tvCategories.includes(id);
	if (inFilms && !inTv) return "films";
	if (inTv && !inFilms) return "tv";
	return null;
}
