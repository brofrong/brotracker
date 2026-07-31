# Astryx Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace BroTracker frontend visuals with Astryx (`theme-stone`), keeping search + qBittorrent live torrent pages functionally identical.

**Architecture:** Mount `Theme(stoneTheme)` + Astryx CSS in root; frame the app with `AppShell`/`SideNav`; migrate Search and Torrents to Astryx `Table`/`TextInput`/`ProgressBar`/status primitives; remove HeroUI and local `components/ui/*`.

**Tech Stack:** TanStack Start/Router/Query, tRPC, Astryx `@astryxdesign/core` + `@astryxdesign/theme-stone`, Bun, Vite.

**Design doc:** `docs/plans/2026-07-31-astryx-frontend-redesign-design.md`

**Working directory:** `apps/frontend` (no worktree)

**CLI habit:** before each UI task run `bunx astryx component <Name> --dense` / `bunx astryx search "<thing>"`.

---

### Task 1: Wire Astryx CSS + Theme provider

**Files:**
- Modify: `apps/frontend/src/styles.css`
- Modify: `apps/frontend/src/routes/__root.tsx`
- Create: `apps/frontend/src/components/theme-provider.tsx` (optional thin wrapper)

**Step 1: Replace global CSS with Astryx + Tailwind layer order**

Replace `apps/frontend/src/styles.css` with:

```css
@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "@astryxdesign/core/reset.css";
@import "@astryxdesign/core/astryx.css";
@import "@astryxdesign/theme-stone/theme.css";
@import "@astryxdesign/core/tailwind-theme.css";
@import "tailwindcss/utilities.css" layer(utilities);
```

Remove HeroUI import, Google Fonts, and old `@theme inline` token bridge.

**Step 2: Add Theme wrapper in root**

In `__root.tsx`:
- Import `Theme` from `@astryxdesign/core/theme`
- Import `{ stoneTheme }` from `@astryxdesign/theme-stone/built`
- Map localStorage `"auto"` → Astryx `"system"`
- Wrap children with `<Theme theme={stoneTheme} mode={mode}>`
- Remove HeroUI-oriented `body` classes / old themeInitScript that toggles `.light`/`.dark` classes if Theme handles mode (keep flash-prevention if needed via Astryx docs; prefer Theme `mode`)

**Step 3: Smoke-check CSS resolves**

Run: `cd apps/frontend && bun run build`
Expected: build succeeds or only pre-existing errors unrelated to missing CSS modules. Fix any unresolved `@astryxdesign/*` CSS imports.

**Step 4: Commit** (only if user asked / at end of batch — skip unless committing)

---

### Task 2: Rebuild navigation with AppShell + SideNav

**Files:**
- Rewrite: `apps/frontend/src/components/navigation/navigation.tsx`
- Rewrite or delete: `apps/frontend/src/components/navigation/nav-item.tsx`
- Modify: `apps/frontend/src/routes/__root.tsx`
- Modify: `apps/frontend/src/components/ThemeToggle.tsx`

**Step 1: Study skeleton**

Run: `bunx astryx template AppShellSideNavOnly --skeleton`
Run: `bunx astryx component SideNavItem --dense`

**Step 2: Implement shell**

`__root.tsx` structure:

```tsx
<Theme theme={stoneTheme} mode={mode}>
  <AppShell
    height="fill"
    contentPadding={0}
    sideNav={<Navigation />}
  >
    {children}
  </AppShell>
</Theme>
```

Remove fixed `pl-64` main wrapper — AppShell owns layout.

**Step 3: Implement Navigation**

```tsx
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {useRouterState, Link} from '@tanstack/react-router';
// icons: Search, Download from lucide-react or Astryx Icon

<SideNav
  header={<SideNavHeading title="BroTracker" />}
  footer={<ThemeToggle />}
>
  <SideNavSection label="Actions">
    <SideNavItem
      label="Поиск"
      href="/"
      icon={Search}
      isSelected={pathname === '/'}
      as={/* TanStack Link adapter if supported */}
      onClick={/* navigate fallback */}
    />
    <SideNavItem label="Торренты" href="/torrents" ... />
  </SideNavSection>
</SideNav>
```

Drop dead Edit/Delete items (no routes) unless user wants them kept as disabled placeholders — **prefer remove**.

**Step 4: ThemeToggle → IconButton**

Replace HeroUI `Button` with:

```tsx
import {IconButton} from '@astryxdesign/core/IconButton';
```

Cycle `light → dark → system`. Persist as `light`/`dark`/`auto` in localStorage for continuity, map `auto`↔`system` at Theme boundary. Lift mode state to root via simple React context if Theme must receive `mode` prop from parent.

**Step 5: Verify**

Run: `cd apps/frontend && bun run dev`
Manual: sidebar renders, routes switch, theme cycles.

---

### Task 3: Migrate SearchBar to TextInput

**Files:**
- Rewrite: `apps/frontend/src/components/search/search-bar.tsx`

**Step 1:** `bunx astryx component TextInput --dense`

**Step 2: Implement**

```tsx
import {TextInput} from '@astryxdesign/core/TextInput';
import {Search} from 'lucide-react';

<TextInput
  label="Поиск"
  isLabelHidden
  value={search ?? ''}
  onChange={(value) => navigate({ search: { search: value } })}
  placeholder="Поиск..."
  // start icon if prop exists; else HStack with Icon + TextInput
/>
```

Keep URL search sync via TanStack `useNavigate` / `useSearch`.

**Step 3: Remove HeroUI SearchField imports.**

---

### Task 4: Migrate Search page Table

**Files:**
- Rewrite: `apps/frontend/src/routes/index.tsx`

**Step 1:** `bunx astryx component Table --dense`  
Also: `bunx astryx component Button --dense`, `Spinner`, `EmptyState`

**Step 2: Define row type + columns**

```tsx
interface SearchRow extends Record<string, unknown> {
  id: string;
  title: string;
  author: string;
  size: string;
  seeds: number | string;
  leeches: number | string;
  downloads: number | string;
  date: string;
  torrentFileUrl: string;
}

import {Table, proportional, pixel} from '@astryxdesign/core/Table';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout'; // or Stack — verify export
import {Spinner} from '@astryxdesign/core/Spinner';
import {EmptyState} from '@astryxdesign/core/EmptyState';
```

Columns: title (`proportional(3)`), author, size, seeds, leeches, downloads, date (`pixel(...)`), action with download `Button`/`Link` (`isExternalLink` or `href`).

Map `data` from tRPC; use stable `id` from title+author or torrent url.

**Step 3: Layout**

```tsx
<VStack gap={3} /* padding via Section or token utilities */>
  <SearchBar />
  {isLoading ? <Spinner label="Загрузка" /> : null}
  {!isLoading && (!data || data.length === 0) ? (
    <EmptyState title="Ничего не найдено" />
  ) : (
    <Table data={rows} columns={columns} />
  )}
</VStack>
```

**Step 4: Keep query options unchanged** (`category: films`, sort by leeches desc).

---

### Task 5: Map torrent status helpers to Astryx variants

**Files:**
- Modify: `apps/frontend/src/utils/torrent-status.ts`

**Step 1: Change variant union** to Astryx Badge variants:

```ts
export type TorrentStatusVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'purple';
```

Map old `danger→error`, `default/secondary/muted→neutral`, keep info/success/warning/purple.

**Step 2: Document rule:** only badge non-default/attention states in UI; common “downloading” can stay `info` or plain Text — prefer Badge for error/warning/paused, Text for routine downloading/uploading if too noisy.

---

### Task 6: Migrate Torrents page

**Files:**
- Rewrite: `apps/frontend/src/routes/torrents.tsx`
- Delete after unused: `apps/frontend/src/components/ui/badge.tsx`, `input.tsx`, `progress.tsx`

**Step 1:** Study `ProgressBar`, `StatusDot`, `Badge`, `Heading`, `Text`, `Table`

**Step 2: Preserve business logic**
- Keep `subscribeToTorrentUpdates` effect
- Keep `filteredTorrents` / `sortKey` / `sortDirection` / `toggleSort`

**Step 3: UI rewrite**
- Header: `HStack` with `Heading` + `StatusDot` (`success` when connected, `error`/`neutral` when not) + `Text`
- Filter: `TextInput`
- Loading: `Spinner`; error: `Banner` or `Text` with error tone
- Empty: `EmptyState`
- Table: columns for name, state, progress, size, dlspeed, upspeed, eta, save_path
  - progress cell: `ProgressBar` `label={torrent.name}` `isLabelHidden` `value={torrent.progress * 100}` `hasValueLabel` `formatValueLabel={() => formatProgress(...)}`
  - state cell: `Badge` with mapped variant **or** Text for default states
- Sorting: either Astryx Table sort plugin **or** keep header click handlers that call existing `toggleSort` (prefer keep existing client sort first for speed; wire Astryx sort plugin only if trivial)

**Step 4: Remove all HeroUI / local ui imports from this file.**

---

### Task 7: Remove HeroUI and dead UI kit

**Files:**
- Delete: `apps/frontend/src/components/ui/badge.tsx`
- Delete: `apps/frontend/src/components/ui/input.tsx`
- Delete: `apps/frontend/src/components/ui/progress.tsx`
- Modify: `apps/frontend/package.json` — remove `@heroui/react`, `@heroui/styles`, and unused `@radix-ui/react-progress` / `@radix-ui/react-slot` if nothing else uses them
- Modify: root `package.json` if it also depends on HeroUI solely for frontend
- Run: `bun install` from repo root

**Step 1:** `rg "@heroui|components/ui/" apps/frontend/src` → must be empty  
**Step 2:** `cd apps/frontend && bun run build` → success  
**Step 3:** `cd apps/frontend && bun run check` (biome) → fix new issues

---

### Task 8: Visual QA checklist

**Manual (dev server on :3100):**
- [ ] Stone theme tokens visible (warm stone/slate, not HeroUI teal)
- [ ] SideNav: BroTracker, Поиск, Торренты; active state correct
- [ ] Theme toggle cycles light/dark/system and persists reload
- [ ] Search: typing updates URL `?search=`, table fills, Download works
- [ ] Torrents: live WS indicator, filter, sort, progress bars, statuses
- [ ] No raw layout regressions (no double side padding / `pl-64` leftover)
- [ ] Empty + loading + error states readable

**Commands:**
```bash
cd apps/frontend
bun run build
bun run check
bun run dev
```

---

### Task 9: Commit (when user asks)

Suggested message:

```
feat(frontend): migrate UI to Astryx stone theme

Replace HeroUI with AppShell/SideNav, Table, and related Astryx
primitives so BroTracker matches the design system.
```

Include: frontend package changes, CSS, routes, components, design/plan docs, AGENTS.md / `.cursor/rules/astryx.mdc` as relevant. Exclude secrets / `.env.local`.

---

## Notes / pitfalls

1. **Cascade layers** — wrong order zeros out Astryx padding; follow Task 1 exactly.
2. **No `<div>` for layout** — use Stack/Layout; Self-check from `AGENTS.md`.
3. **Table `Record<string, unknown>`** — row interfaces must `extends Record<string, unknown>`.
4. **Nested git** — `apps/frontend` has its own `.git` with no commits; monorepo also tracks `?? apps/frontend/`. Prefer committing where the user expects (ask once before first commit).
5. **Always** `bunx astryx component <Name>` before inventing props.
