# Fix: published site serves an outdated page

## What's happening

Two separate things can make a fresh browser show an old version, and both apply here.

1. **The published site is a snapshot.** Frontend changes only reach `shakyamunilmas.lovable.app` / `shakyamunilmas.online` after you press Publish → Update. Backend changes go live immediately, frontend ones do not. The currently published build is whatever was last published, so recent Metal Rates work may simply not be deployed yet.

2. **The offline service worker is pinning the old app shell.** Confirmed by fetching the live `/sw.js`: it precaches `index.html` and registers a navigation fallback route to that precached copy **before** the NetworkFirst navigation rule. Workbox uses the first matching route, so page loads are answered from cache, not the network. Combined with `assets/*` being cached CacheFirst for 30 days, a returning visitor can keep seeing the old build even after a successful publish.

## Changes

**Service worker config (`vite.config.ts`)**
- Remove `navigateFallback` / `navigateFallbackDenylist` so the precached `index.html` route no longer intercepts navigations, leaving the NetworkFirst rule as the only navigation handler (still serving cached HTML when genuinely offline).
- Exclude `index.html` from the precache manifest so the app shell is never frozen at a build-time revision.
- Keep `CacheFirst` for hashed `assets/*` files only — those are content-hashed, so they are safe and are re-fetched whenever a new `index.html` references new filenames.
- Keep `registerType: "autoUpdate"` and `cleanupOutdatedCaches` so the new worker takes over promptly.

**Rollout note**
- Anyone who already loaded the old build has the old worker installed. After the new version is published, their next visit installs the corrected worker and the visit after that shows current content. A hard reload, or appending `?sw=off` to the URL (already supported by the registration guard), clears it immediately.

**Publish**
- Publish after the change so the fix is actually live; from then on a normal publish is enough for updates to appear.

## Verification

- Re-fetch the live `/sw.js` after publishing and confirm the navigation-fallback precache route is gone.
- Load Metal Rates in a clean browser profile and confirm the current build is served.
