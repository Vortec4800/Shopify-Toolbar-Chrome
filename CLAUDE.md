# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension that restores a horizontal saved-views tab strip on Shopify admin list pages (Orders, Products, Customers, Draft Orders). The extension never talks to Shopify's API — it reads the native "All ⇅" dropdown out of the DOM and replays clicks back into it, so Shopify still owns the actual filter switching.

No build system, no package manager, no tests. Three source files: `manifest.json`, `content.js`, `styles.css`.

## Dev loop

1. Load unpacked: `chrome://extensions` → Developer mode on → **Load unpacked** → select this folder.
2. After editing any file, click the reload icon on the extension card in `chrome://extensions`, then refresh the Shopify admin tab. Both steps are required — editing `content.js` alone is not picked up until the extension is reloaded.
3. Verify on a list page like `https://admin.shopify.com/store/<you>/orders`. Open DevTools → Console and look for `[views-tabs]` log lines.

### Debug hooks (DevTools console, on the Shopify tab)

- `window.__viewsTabsDebug = false` — silence logs. Checked per log call, so it takes effect immediately.
- `window.__viewsTabsRescan()` — tear down the current tab bar and re-read the dropdown. Useful when a non-active view was renamed/deleted (the auto-rescan only fires when the *active* label becomes one we don't recognize).

## Architecture

The entire runtime lives in `content.js`. Flow:

1. **Scan trigger** — a `MutationObserver` on `document.body` debounces calls to `maybeScan()` (150ms). `maybeScan` bails if the path hasn't changed and the bar still exists, which is what keeps the extension cheap on a SPA that mutates constantly.
2. **Read views** — `readViewsFromDropdown()` programmatically opens the "All ⇅" popover (if not already open), waits up to ~1s for menu items, scrapes `[role="menuitemradio"]` entries, then closes the popover if it opened it. Each view is `{ label, checked, index }`.
3. **Render** — `renderTabs()` inserts `#views-tabs-bar` as the *next sibling* of the filter row's outer bordered box. `findFilterRowAnchor()` walks up from the searchbar looking for a Polaris box identified by the inline CSS custom property `--pc-box-border-block-end-width`, with a fixed-depth fallback. This is deliberately fuzzy — Shopify's hashed class names (`_Foo_ab12c_3`) are not stable, but structural and style-token markers are more durable.
4. **Click delegation** — `activateView()` re-opens the dropdown, finds the matching menuitemradio (by label first, then by stored index), and clicks it. Shopify handles everything after that. An `activating` flag prevents rapid-click overlap.
5. **Active-view sync** — `observeActiveView()` attaches a `MutationObserver` to the trigger button's inner `<s-internal-text>` so we can update `aria-current` on our tab when Shopify changes the active filter. If the new label isn't in our tab set, we force a rescan (handles add/rename of the active view).

The native dropdown is intentionally left visible — it's both a fallback and the only entry point for add/rename/delete.

## Selectors (the load-bearing part)

All selectors live in `SEL` at the top of `content.js`. When Shopify redesigns something, this is what breaks. README.md has a table mapping each selector to its drift risk and a "Locking new selectors" walkthrough — consult that before guessing at replacements.

Selector preference order when updating: `data-*` attributes > `aria-*` attributes > custom element tags (e.g. `s-internal-text`, `s-press-button`) > **never** hashed Polaris class names.

Two menu-item gotchas worth internalizing:

- Must be `role="menuitemradio"`, not `role="menuitem"`. The plain `menuitem` role also matches "Add view" and other management actions, which would pollute the tab strip.
- Active state is `aria-checked="true"` (radio semantics), not `aria-selected`.

## Scope

Light mode admin only. Dark mode colors are not handled. Classic (non-React) admin is untested. If you're about to add styling, match the existing hardcoded Shopify admin palette in `styles.css` (`#e1e3e5`, `#303030`, `#f1f2f4`, `#005bd3`).
