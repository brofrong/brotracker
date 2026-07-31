# Download to qBittorrent — design

Date: 2026-07-31  
Status: approved

## Goal

From search results (table + cards), download a torrent into qBittorrent with the correct save path for films vs series, after confirming media type in a modal.

## Decisions

| Topic | Choice |
|--------|--------|
| Media type detection | `forumId` against existing `filmsCategories` / `tvCategories` in rutracker |
| Ambiguous / unknown | User must pick Фильм or Сериал before Download is enabled |
| Save paths | Settings `filmsPath` / `seriesPath` |
| Modal | Astryx `Dialog` (purpose=`form`) with torrent info + SegmentedControl |
| Table actions | **Скачать** (modal) + **На трекере** (`topicUrl`, new tab) |
| Cards | Add **Скачать**; keep existing **На форум** |
| Feedback | `useToast` success/error |
| Torrent file fetch | Backend downloads `.torrent` via authenticated rutracker (`getTorrent`), then posts to qBittorrent |

## Flow

1. User clicks **Скачать** on a search row/card.
2. Modal opens with title, size, seeds/leeches, quality tags.
3. Media type preselected from `detectMediaType(forumId)` → `"films" | "tv" | null`.
4. If `null`, SegmentedControl has no selection until user picks; **Скачать** disabled.
5. Confirm → `qbittorent.add` mutation with `torrentFileUrl` + `mediaType`.
6. Backend resolves path, fetches `.torrent` with session cookies, adds to qBittorrent with `savepath`.
7. Toast on success/error; modal closes on success.

## API

```ts
qbittorent.add: {
  input: {
    torrentFileUrl: string;
    mediaType: "films" | "tv";
  };
  output: { ok: true };
}
```

Errors (user-facing):
- qBittorrent not configured
- films/series path empty
- rutracker download failed
- qBittorrent API failed

## Detection

Export helper from `@brotracker/rutracker-ts`:

```ts
detectMediaType(forumId: string): "films" | "tv" | null
```

- Only in films list → `"films"`
- Only in tv list → `"tv"`
- In both or neither → `null` (e.g. shared forum `807`)

## Out of scope

- Magnet links
- Category filter on search UI
- Opening OS torrent client / `.torrent` file download in browser
