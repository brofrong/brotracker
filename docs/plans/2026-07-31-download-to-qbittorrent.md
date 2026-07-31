# Download to qBittorrent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users add a search result torrent to qBittorrent via a confirm modal, choosing film vs series save path (auto-detected from forumId when possible).

**Architecture:** Detect media type from rutracker forum category ID lists. Frontend opens an Astryx Dialog; on confirm, backend downloads the `.torrent` with authenticated rutracker session and POSTs it to qBittorrent `/torrents/add` with the configured `filmsPath` or `seriesPath`.

**Tech Stack:** Bun, tRPC, React Query, Astryx Dialog/SegmentedControl/Toast, axios+neverthrow rutracker client, qBittorrent WebAPI.

**Design:** `docs/plans/2026-07-31-download-to-qbittorrent-design.md`

---

### Task 1: Media type detection helper

**Files:**
- Modify: `packages/rutracker-ts/src/tracker/search-engine/rutracker/search-options.ts`
- Create: `packages/rutracker-ts/src/tracker/search-engine/rutracker/media-type.ts`
- Create: `packages/rutracker-ts/test/unit/media-type.test.ts`

**Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { detectMediaType } from "../../src/tracker/search-engine/rutracker/media-type";

test("detectMediaType: film-only forum", () => {
	expect(detectMediaType("2198")).toBe("films");
});

test("detectMediaType: tv-only forum", () => {
	expect(detectMediaType("189")).toBe("tv");
});

test("detectMediaType: shared or unknown → null", () => {
	expect(detectMediaType("807")).toBeNull();
	expect(detectMediaType("999999")).toBeNull();
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/rutracker-ts && bun test test/unit/media-type.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement**

In `search-options.ts`, export `filmsCategories` and `tvCategories` (or move lists into `media-type.ts` and import them from search-options — prefer keep lists in one place, export Sets from media-type).

```ts
// media-type.ts
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
```

Export categories from `search-options.ts` (change `const` → `export const`).

**Step 4: Run tests**

Run: `cd packages/rutracker-ts && bun test test/unit/media-type.test.ts`
Expected: PASS

---

### Task 2: Implement `getTorrent` (download `.torrent` bytes)

**Files:**
- Modify: `packages/rutracker-ts/src/tracker/tracker-interface.ts` — change return type to `Result<Uint8Array, Error>`
- Create: `packages/rutracker-ts/src/tracker/search-engine/rutracker/get-torrent.ts`
- Modify: `packages/rutracker-ts/src/tracker/search-engine/rutracker/index.ts`
- Test: `packages/rutracker-ts/test/unit/get-torrent.test.ts` (unit: content-type / magic bytes validation helper if extracted; full download is e2e-only)

**Step 1: Implement download mirroring `get-image.ts` pattern**

```ts
// GET torrentFileUrl with Cookie + UA, responseType: arraybuffer
// Retry once on Cloudflare challenge via acquireCfClearance + rutrackerGetCookies
// Validate: HTTP 200, body looks like torrent (starts with "d" bencode) OR content-disposition/content-type
// Return ok(new Uint8Array(response.data))
```

Wire in `createRutracker.getTorrent`.

Update interface:

```ts
getTorrent(torrentFileUrl: string): Promise<Result<Uint8Array, Error>>;
```

**Step 2: Unit-test validation helper** (optional small `isTorrentPayload(buf: Uint8Array): boolean` checking first byte `d`)

**Step 3: Run unit tests**

Run: `cd packages/rutracker-ts && bun test test/unit`

---

### Task 3: qBittorrent client accepts torrent bytes

**Files:**
- Modify: `apps/backend/src/qbittorent/qbittorent.client.ts`
- Modify: `apps/backend/src/qbittorent/qbittorent.types.ts`
- Modify: `apps/backend/src/qbittorent/qbittorent.service.ts`

**Step 1: Extend `addTorrent`**

Accept `string | Uint8Array` (URL/path or raw bytes):

```ts
export async function addTorrent(
  torrentFileOrMagnetLinkOrBytes: string | Uint8Array,
  options: { pathToSave: string; filename?: string },
): Promise<void> {
  const formData = new FormData();
  formData.append("savepath", options.pathToSave);

  if (torrentFileOrMagnetLinkOrBytes instanceof Uint8Array) {
    const blob = new Blob([torrentFileOrMagnetLinkOrBytes], {
      type: "application/x-bittorrent",
    });
    formData.append("torrents", blob, options.filename ?? "download.torrent");
  } else if (isTorrentUrl(...)) {
    // existing urls branch
  } else {
    // existing file path branch
  }
  await qbittorentRequest("/torrents/add", { method: "POST", body: formData });
}
```

---

### Task 4: `qbittorent.add` tRPC mutation

**Files:**
- Modify: `apps/backend/src/qbittorent/qbittorent.router.ts`
- Modify: `apps/backend/src/qbittorent/qbittorent.service.ts` (optional thin `addFromTracker` wrapper)
- Use: `apps/backend/src/torrent/torrent.tracker.ts` (`getTracker`)
- Use: `apps/backend/src/settings/qbittorrent-config.ts` (`loadQbittorrentConfig`)

**Step 1: Add mutation**

```ts
add: publicProcedure
  .input(z.object({
    torrentFileUrl: z.string().url(),
    mediaType: z.enum(["films", "tv"]),
  }))
  .mutation(async ({ input }) => {
    const config = await loadQbittorrentConfig();
    if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "..." });
    const pathToSave = input.mediaType === "films" ? config.filmsPath : config.seriesPath;
    if (!pathToSave) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Путь не задан в настройках" });

    const tracker = await getTracker();
    const file = await tracker.getTorrent(input.torrentFileUrl);
    if (file.isErr()) throw new TRPCError({ code: "BAD_GATEWAY", message: file.error.message });

    await qbittorentService.addTorrent(file.value, { pathToSave });
    return { ok: true as const };
  }),
```

Check how other routers throw errors (TRPCError vs plain Error) and match.

**Step 2: Verify backend typechecks**

Run: `cd apps/backend && bunx tsc --noEmit` (or project’s usual check)

---

### Task 5: Download confirm dialog component

**Files:**
- Create: `apps/frontend/src/components/search/download-torrent-dialog.tsx`
- Reference: `bunx astryx template DialogFormDialog`, `bunx astryx component Dialog`, SegmentedControl, useToast

**Step 1: Build controlled Dialog**

Props:

```ts
type DownloadTorrentDialogProps = {
  item: {
    title: string;
    size: string;
    seeds: number | string;
    leeches: number | string;
    resolution: ...;
    hdr: ...;
    torrentFileUrl: string;
    forumId: string;
  } | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};
```

- On open / item change: `mediaType = detectMediaType(item.forumId)` (import from rutracker package path used by backend, or duplicate thin client helper that calls shared export — prefer importing `@brotracker/rutracker-ts/tracker/search-engine/rutracker/media-type` if package exports allow `./*`)
- SegmentedControl: Фильм=`films`, Сериал=`tv`; if detected null, start with empty — use local state `"" | "films" | "tv"` and disable submit when `""`
- Footer: Отмена / Скачать (`isLoading` from mutation, `isDisabled` when no mediaType)
- `useMutation(trpc.qbittorent.add.mutationOptions())` + `useToast().showToast`
- Success → toast + close; error → toast type error

---

### Task 6: Wire search page (table + cards)

**Files:**
- Modify: `apps/frontend/src/routes/index.tsx`
- Modify: `apps/frontend/src/components/search/search-results-cards.tsx`

**Step 1: Extend row/card types** with `forumId: string` (already on API results — pass through `toSearchRows`).

**Step 2: Table actions column**

Replace single download link with `HStack`:

- Button `Скачать` → `onClick` sets selected item + opens dialog
- Button `На трекере` → `href={topicUrl}` `isExternalLink` `target="_blank"` variant secondary/ghost, icon externalLink

Widen action column (~180–220px).

**Step 3: Cards**

Add primary/secondary **Скачать** button; keep **На форум**. Pass `onDownload(item)` from parent or open dialog via callback prop:

```ts
<SearchResultsCards items={rows} onDownload={setPendingDownload} />
```

**Step 4: Render `<DownloadTorrentDialog />` once at page level.**

---

### Task 7: Manual smoke check

1. Open search, find a film result (forum in films-only list) → Скачать → modal shows Фильм selected → confirm → torrent appears in qBittorrent under filmsPath.
2. Ambiguous/unknown forum → Скачать disabled until user picks type.
3. Empty path in settings → clear error toast.
4. Table **На трекере** opens topic in new tab.
5. Cards **Скачать** same modal flow.

---

## Notes

- Do **not** commit unless the user asks (repo commit policy).
- Existing uncommitted WIP on torrents free-space UI is unrelated — leave it alone.
- Shared forum id `807` is in both lists → `null` by design.
