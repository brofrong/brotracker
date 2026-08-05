# Frontend vertical feature slices

UI is organized as vertical feature slices under `apps/frontend/src/features/<name>/`. Route files stay thin: they only declare the route, parse params/search, and render a feature page with those values as props.

**Why:** god-route files (`torrents`, `title.$id`, `settings`) force agents to load entire features to change one panel, and hide where data hooks and invalidation live.

**Rules:** no business UI, forms, tables, or tRPC hooks inside `routes/*`. Features do not import other features — shared UI/lib goes in `shared/`. The tRPC client stays in `shared/lib`; feature-specific query/mutation hooks colocate with the feature. Features should not depend on TanStack Router internals beyond props the route passed in.

**Migration:** extract existing god routes incrementally into `features/{torrents,title,settings,search,home}`; keep URL paths stable.
