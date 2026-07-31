# BroTracker Frontend → Astryx Redesign

**Date:** 2026-07-31  
**Status:** Approved

## Goal

Replace the entire BroTracker frontend visual layer with [Astryx](https://astryx.atmeta.com/) components. Keep existing routes, tRPC/search, and qBittorrent live subscription behavior unchanged.

## Decisions

| Topic | Choice |
|---|---|
| Theme | `@astryxdesign/theme-stone` |
| Migration depth | Full replacement of HeroUI + local `components/ui/*` |
| Navigation | Keep sidebar pattern via `AppShell` + `SideNav` |
| Styling | Component props first; token-backed Tailwind via Astryx bridge only |
| Scope | Visual/UI only — no new product features |

## Architecture

1. **Root:** `Theme(stoneTheme)` wraps the app. Global CSS imports `reset.css`, `astryx.css`, `theme-stone/theme.css`, plus explicit cascade layers if Tailwind remains during cleanup.
2. **Frame:** `AppShell` (`height="fill"`, `contentPadding={0}`) with `SideNav` (~256px): BroTracker heading, Search / Torrents items, theme mode control in footer.
3. **Search (`/`):** `TextInput` + edge-to-edge `Table` + download `Button`. Loading → `Spinner`; empty → `EmptyState`.
4. **Torrents (`/torrents`):** `Heading` + live `StatusDot`, filter `TextInput`, sortable `Table` with `ProgressBar` / status `Badge` or plain `Text`. Preserve WebSocket subscription + sort/filter logic.
5. **Layout primitives:** `VStack` / `HStack` / `Section` — no raw layout `<div>` / `style={{}}`.

## Component Mapping

| Current | Astryx |
|---|---|
| HeroUI Surface / custom Navigation | `AppShell`, `SideNav`, `SideNavHeading`, `SideNavSection`, `SideNavItem` |
| ThemeToggle | `Theme` mode (`light` / `dark` / `system`) |
| SearchBar / Input | `TextInput` |
| HeroUI Table / raw `<table>` | `Table` |
| Radix Progress | `ProgressBar` |
| Custom Badge | `Badge` (exception states only) or `Text` / `StatusDot` |
| Connection indicator | `StatusDot` + `Text` |
| HeroUI Button | `Button` / `IconButton` |
| Loading text | `Spinner` / `Skeleton` |
| Empty rows | `EmptyState` |

## Remove After Migration

- `@heroui/react`, `@heroui/styles`
- `apps/frontend/src/components/ui/{badge,input,progress}.tsx`
- HeroUI-based navigation / theme helpers that are unused

## Out of Scope

- PowerSearch, detail inspector panels, new routes
- Backend / rutracker-ts changes
- MCP user-config changes unless explicitly requested

## Agent Setup (done)

- Packages: `@astryxdesign/core`, `@astryxdesign/theme-stone`, `@astryxdesign/cli`
- Docs: `AGENTS.md`, `.cursor/rules/astryx.mdc`
- CLI: `bun run astryx` → `bunx astryx`
