# Search Local-First + Tracker Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/search` return local DB hits immediately while a parallel tracker refresh upserts and replaces the list, with a non-blocking “searching tracker” indicator and a toast on tracker failure.

**Architecture:** Split catalog into `search` (local only) and `searchRefresh` (tracker → upsert → results; throws on tracker failure). Frontend fires both React Query queries on submit; display prefers refresh data when successful, else local; indicator bound to refresh fetching.

**Tech Stack:** Bun, tRPC, React Query, TanStack Router, Astryx, Drizzle/Postgres, RuTracker client.

**Design:** `docs/plans/2026-08-04-search-local-first-refresh-design.md`

---

### Task 1: Catalog — split `search` / `searchRefresh` (TDD)

**Files:**
- Modify: `apps/backend/src/catalog/catalog.ts`
- Modify: `apps/backend/src/catalog/catalog.test.ts`

**Step 1: Rewrite failing tests for the new API**

Replace `catalog.test.ts` so it targets two methods and drops `source` from the response:

```ts
import { describe, expect, test } from "bun:test";
import type { SearchResult } from "@brotracker/rutracker-ts/tracker/tracker-interface";
import { createCatalog, type CatalogDeps } from "./catalog";

const hit = (overrides: Partial<SearchResult> = {}): SearchResult => ({
	torrentId: "100",
	title: "Example Film",
	category: "films",
	forumId: "1",
	authorId: "2",
	size: 1e9,
	seeds: 10,
	leeches: 1,
	downloads: 5,
	date: new Date("2024-01-01T00:00:00Z"),
	torrentFileUrl: "https://rutracker.org/forum/dl.php?t=100",
	topicUrl: "https://rutracker.org/forum/viewtopic.php?t=100",
	hdr: "SDR",
	resolution: "1080p",
	...overrides,
});

function unusedTrackerDeps(): Pick<
	CatalogDeps,
	| "searchTracker"
	| "upsertFromTracker"
	| "loadImageKeys"
	| "enqueueCoverFetch"
> {
	return {
		searchTracker: async () => {
			throw new Error("tracker should not be used for local search");
		},
		upsertFromTracker: async () => {
			throw new Error("upsert should not run for local search");
		},
		loadImageKeys: async () => new Map(),
		enqueueCoverFetch: () => {
			throw new Error("cover enqueue should not run for local search");
		},
	};
}

describe("catalog.search", () => {
	test("returns local hits with cover URLs from image keys", async () => {
		const catalog = createCatalog({
			normalizeTitle: (q) => q.trim().toLowerCase(),
			searchLocal: async () => [
				{ ...hit({ torrentId: "1" }), imageKey: "covers/1.webp" },
				{ ...hit({ torrentId: "2", title: "No Cover" }), imageKey: null },
			],
			publicUrl: (key) => `https://app.test/media/${key}`,
			...unusedTrackerDeps(),
		});

		const response = await catalog.search("Example");

		expect(response).toEqual({
			totalResults: 2,
			results: [
				{
					...hit({ torrentId: "1" }),
					imageUrl: "https://app.test/media/covers/1.webp",
				},
				{
					...hit({ torrentId: "2", title: "No Cover" }),
					imageUrl: null,
				},
			],
		});
	});
});

describe("catalog.searchRefresh", () => {
	test("upserts, enriches covers, enqueues only missing covers", async () => {
		const upserted: string[] = [];
		const enqueued: string[][] = [];

		const catalog = createCatalog({
			normalizeTitle: (q) => q,
			searchLocal: async () => {
				throw new Error("local search should not run for refresh");
			},
			searchTracker: async () => ({
				status: "ok",
				totalResults: 2,
				results: [
					hit({ torrentId: "10" }),
					hit({ torrentId: "11", title: "Needs Cover" }),
				],
			}),
			upsertFromTracker: async (results) => {
				upserted.push(...results.map((r) => r.torrentId));
			},
			loadImageKeys: async () =>
				new Map<string, string | null>([
					["10", "covers/10.webp"],
					["11", null],
				]),
			publicUrl: (key) => `https://app.test/media/${key}`,
			enqueueCoverFetch: (ids) => {
				enqueued.push(ids);
			},
		});

		const response = await catalog.searchRefresh("film", {});

		expect(upserted).toEqual(["10", "11"]);
		expect(enqueued).toEqual([["11"]]);
		expect(response).toEqual({
			totalResults: 2,
			results: [
				{
					...hit({ torrentId: "10" }),
					imageUrl: "https://app.test/media/covers/10.webp",
				},
				{
					...hit({ torrentId: "11", title: "Needs Cover" }),
					imageUrl: null,
				},
			],
		});
	});

	test("throws when tracker is unavailable", async () => {
		const catalog = createCatalog({
			normalizeTitle: (q) => q,
			searchLocal: async () => [],
			searchTracker: async () => ({ status: "unavailable" }),
			upsertFromTracker: async () => {
				throw new Error("should not upsert when unavailable");
			},
			loadImageKeys: async () => new Map(),
			publicUrl: (key) => key,
			enqueueCoverFetch: () => {
				throw new Error("should not enqueue when unavailable");
			},
		});

		await expect(catalog.searchRefresh("film", {})).rejects.toThrow(
			/tracker/i,
		);
	});

	test("throws when tracker returns error", async () => {
		const catalog = createCatalog({
			normalizeTitle: (q) => q,
			searchLocal: async () => [],
			searchTracker: async () => ({
				status: "error",
				error: new Error("timeout"),
			}),
			upsertFromTracker: async () => {
				throw new Error("should not upsert on error");
			},
			loadImageKeys: async () => new Map(),
			publicUrl: (key) => key,
			enqueueCoverFetch: () => {
				throw new Error("should not enqueue on error");
			},
		});

		await expect(catalog.searchRefresh("film", {})).rejects.toThrow("timeout");
	});
});
```

**Step 2: Run tests — expect FAIL**

Run: `bun test apps/backend/src/catalog/catalog.test.ts`

Expected: FAIL (old `source` API / missing `searchRefresh`).

**Step 3: Implement catalog API**

Update `apps/backend/src/catalog/catalog.ts`:

```ts
export type CatalogSearchResponse = {
	results: CatalogSearchResult[];
	totalResults: number | null;
};

export function createCatalog(deps: CatalogDeps) {
	const mapLocal = (local: LocalCatalogHit[]): CatalogSearchResult[] =>
		local.map((hit) => ({
			torrentId: hit.torrentId,
			title: hit.title,
			category: hit.category,
			forumId: hit.forumId,
			authorId: hit.authorId,
			size: hit.size,
			seeds: hit.seeds,
			leeches: hit.leeches,
			downloads: hit.downloads,
			date: hit.date,
			torrentFileUrl: hit.torrentFileUrl,
			topicUrl: hit.topicUrl,
			hdr: hit.hdr,
			resolution: hit.resolution,
			imageUrl: hit.imageKey ? deps.publicUrl(hit.imageKey) : null,
		}));

	return {
		search: async (query: string): Promise<CatalogSearchResponse> => {
			const local = await deps.searchLocal(deps.normalizeTitle(query));
			return {
				results: mapLocal(local),
				totalResults: local.length,
			};
		},

		searchRefresh: async (
			query: string,
			options: Partial<SearchOptions>,
		): Promise<CatalogSearchResponse> => {
			const outcome = await deps.searchTracker(query, options);
			if (outcome.status === "unavailable") {
				throw new Error("Tracker unavailable");
			}
			if (outcome.status === "error") {
				throw outcome.error;
			}

			await deps.upsertFromTracker(outcome.results);

			const ids = outcome.results.map((r) => r.torrentId);
			const imageKeyById = await deps.loadImageKeys(ids);

			const results: CatalogSearchResult[] = outcome.results.map((r) => {
				const key = imageKeyById.get(r.torrentId) ?? null;
				return {
					...r,
					imageUrl: key ? deps.publicUrl(key) : null,
				};
			});

			const missingCoverIds = ids.filter((id) => !imageKeyById.get(id));
			deps.enqueueCoverFetch(missingCoverIds);

			return {
				results,
				totalResults: outcome.totalResults,
			};
		},
	};
}
```

Keep existing imports/types (`CatalogDeps`, `LocalCatalogHit`, etc.).

**Step 4: Run tests — expect PASS**

Run: `bun test apps/backend/src/catalog/catalog.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/backend/src/catalog/catalog.ts apps/backend/src/catalog/catalog.test.ts
git commit -m "refactor(catalog): split local search and tracker refresh"
```

---

### Task 2: tRPC — `torrent.search` + `torrent.searchRefresh`

**Files:**
- Modify: `apps/backend/src/torrent/torrent.router.ts`

**Step 1: Update router**

```ts
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
```

**Step 2: Typecheck backend**

Run: `bun run --cwd apps/backend check-types` (or repo equivalent if that script exists; otherwise `bunx tsc -p apps/backend --noEmit`)

Expected: no errors related to catalog/router. Fix any call sites of old `catalog.search(..., { source })` — only the router should call it; title page uses its own path.

**Step 3: Commit**

```bash
git add apps/backend/src/torrent/torrent.router.ts
git commit -m "feat(torrent): expose search and searchRefresh procedures"
```

---

### Task 3: SearchBar — single submit

**Files:**
- Modify: `apps/frontend/src/components/search/search-bar.tsx`

**Step 1: Simplify props and UI**

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack, StackItem } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useEffect, useState, type FormEvent } from "react";

type SearchBarProps = {
	initialQuery?: string;
	isSearching?: boolean;
	onSearch: (query: string) => void;
};

export const SearchBar = ({
	initialQuery = "",
	isSearching = false,
	onSearch,
}: SearchBarProps) => {
	const [query, setQuery] = useState(initialQuery);
	const canSearch = query.trim().length > 0;

	useEffect(() => {
		setQuery(initialQuery);
	}, [initialQuery]);

	const submit = () => {
		const trimmed = query.trim();
		if (!trimmed) return;
		onSearch(trimmed);
	};

	const onSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		submit();
	};

	return (
		<form onSubmit={onSubmit}>
			<HStack gap={2} vAlign="end" width="100%">
				<StackItem size="fill">
					<TextInput
						label="Поиск"
						isLabelHidden
						value={query}
						onChange={setQuery}
						placeholder="Поиск..."
						startIcon="search"
						hasClear
						width="100%"
					/>
				</StackItem>
				<Button
					label="Найти"
					type="submit"
					variant="primary"
					isDisabled={!canSearch}
					isLoading={isSearching}
				/>
			</HStack>
		</form>
	);
};
```

Notes:
- Do **not** disable the whole bar while tracker refresh runs — `isSearching` here should mean **local** initial load only (parent will pass that). User must keep using UI during refresh.
- Remove exported `SearchSource` type (update imports in `search.tsx`).

**Step 2: Commit**

```bash
git add apps/frontend/src/components/search/search-bar.tsx
git commit -m "feat(search): single submit search bar"
```

---

### Task 4: Search page — dual query, indicator, toast

**Files:**
- Modify: `apps/frontend/src/routes/search.tsx`

**Step 1: Wire dual queries + UX**

Key behavior (implement fully in file):

1. URL schema: `{ search?: string }` only — drop `source`.
2. `hasActiveSearch = Boolean(search?.trim())`.
3. Local query:
   ```ts
   const localQuery = useQuery({
     ...trpc.torrent.search.queryOptions({ search }),
     enabled: hasActiveSearch,
     refetchOnWindowFocus: false,
   });
   ```
4. Refresh query:
   ```ts
   const refreshQuery = useQuery({
     ...trpc.torrent.searchRefresh.queryOptions({
       search,
       options: { sortType: "leechesCount", sortOrder: "descending" },
     }),
     enabled: hasActiveSearch,
     refetchOnWindowFocus: false,
     retry: false,
   });
   ```
5. Display data:
   - If `refreshQuery.isSuccess` → use `refreshQuery.data`
   - Else → use `localQuery.data`
6. Loading:
   - Full-page `Spinner` only while local has no data yet and `localQuery.isLoading` (first paint).
   - Do **not** hide results while refresh is fetching.
7. Tracker indicator: when `hasActiveSearch && refreshQuery.isFetching`, show non-blocking status under the bar, e.g. `HStack` + `Spinner` size sm + `Text`: «Ищем на трекере…». Discover via `bunx astryx search "spinner"` / `astryx component Spinner` / `Banner` if a status pattern fits — prefer Astryx components, no raw `<div>`.
8. Badge: `Найдено: N` (or omit source wording). Optionally after refresh success use teal/blue once — keep simple: one badge with count from displayed results.
9. Toast on refresh error — use `useToast` + `useEffect`:

```ts
const toast = useToast();

useEffect(() => {
  if (!refreshQuery.isError) return;
  toast({
    type: "error",
    body: refreshQuery.error.message || "Не удалось получить данные с трекера",
  });
}, [refreshQuery.isError, refreshQuery.error, toast]);
```

Guard against toast spam if React Strict Mode double-fires: acceptable if toast dedupes; otherwise track last toasted `error`/`dataUpdatedAt` with a ref.

10. Empty state: show «Ничего не найдено» only when local settled (or refresh settled) with zero rows — if local empty but refresh still fetching, show empty list + indicator, **not** final empty title alone without indicator. Prefer: if rows.length === 0 && !localQuery.isLoading && !refreshQuery.isFetching → EmptyState; if rows.length === 0 && refresh still fetching → indicator only (or EmptyState + indicator).

11. `handleSearch`:
    ```ts
    void navigate({ search: { search: query }, replace: true });
    ```

12. Pass to SearchBar: `isSearching={hasActiveSearch && localQuery.isLoading && !localQuery.data}` (or `isFetching` only when no displayed rows yet).

13. Local query hard error: keep EmptyState «Ошибка поиска» for local failure. Refresh errors → toast only.

**Step 2: Manual / typecheck**

Run: `bun run --cwd apps/frontend check-types` (or project script).

**Step 3: Commit**

```bash
git add apps/frontend/src/routes/search.tsx
git commit -m "feat(search): local-first results with parallel tracker refresh"
```

---

### Task 5: Verify + polish

**Step 1: Backend tests**

Run: `bun run --cwd apps/backend test`

Expected: all pass (including catalog).

**Step 2: Frontend types**

Run frontend check-types / lint as used in repo.

**Step 3: Grep leftovers**

```bash
rg "source: \"local\"|SearchSource|searchingSource|source === \"tracker\"" apps/frontend/src/components/search apps/frontend/src/routes/search.tsx apps/backend/src/catalog apps/backend/src/torrent/torrent.router.ts
```

Expected: no stale search-page source toggle. (Title page `source: "local" | "tracker"` in its own types is OK — leave alone.)

**Step 4: Final commit if any fixups**

```bash
git add -u
git commit -m "fix(search): address leftover source toggle / types"
```

(Skip empty commit if clean.)

---

## Out of scope (do not do)

- Change `title.torrents` parallel search
- SSE / streaming
- Merge local+tracker rows
- Live cover updates on search page
- Push/PR unless asked
