# Shopify Admin Saved Views Tabs

A Manifest V3 Chrome extension that brings back the old horizontal tab strip for saved views on Shopify admin list pages (Orders, Products, Customers, Draft Orders). Shopify moved saved views into a dropdown behind the "All ⇅" button — this extension reads them out and re-renders them as clickable tabs.

Delegates the actual filter switch back to Shopify by clicking the matching dropdown item, so no Shopify API calls and no auth setup.

## Current version: v0.2.0

Renders a horizontal tab strip just below the filter row. Clicks on a tab re-open the native dropdown under the hood and click the matching menu item, so Shopify handles the actual filter switch. The original "All ⇅" dropdown is kept visible as a fallback and as the access point for adding/renaming/deleting views.

## Load unpacked

1. Open Chrome → `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked**.
4. Select this folder (`Shopify-Toolbar-Chrome`).
5. Open a Shopify admin list page (e.g. `https://admin.shopify.com/store/<you>/orders`).
6. Open DevTools → **Console**. You should see entries like:
   ```
   [views-tabs] path: /store/xxx/orders
   [views-tabs] views found: ["All", "Unfulfilled", "Unpaid", …]
   [views-tabs] active view: All
   ```

After making changes to this folder, click the reload icon on the extension card in `chrome://extensions` and refresh the Shopify tab.

## DEBUG toggle

Logging is on by default. To silence it without editing code, run this in the DevTools console on the Shopify tab:

```js
window.__viewsTabsDebug = false;   // silence
window.__viewsTabsDebug = true;    // re-enable
```

The flag is checked per log call, so toggling takes effect immediately.

## Manual rescan

If the tab bar looks stale (e.g. you renamed/deleted a non-active view and the label on our tab didn't update), force a rescan from DevTools:

```js
window.__viewsTabsRescan();
```

This tears down the current bar and re-reads the dropdown. The bar also auto-rescans whenever the active view's name doesn't match any existing tab — which covers the "user just created a new view and Shopify switched to it" case.

## Known fragile points

These are the assumptions most likely to break when Shopify ships a redesign. All live in `content.js`:

| Thing | Current value | Why it might drift |
|---|---|---|
| Filter-bar scope | `[data-searchbar-plus="true"]` | Shopify could rename the searchbar component or drop the data attribute. |
| Trigger button | `button[aria-haspopup="menu"]` (scoped to searchbar) | If they swap to a non-button element or change ARIA. |
| Popover lookup | `trigger.aria-controls` → `getElementById(...)` | Fallback: `[role="menu"]`. If both fail, menu items are unreachable. |
| Menu items | `[role="menuitemradio"]` | Was `role="menuitem"` in older Polaris; the radio variant specifically filters *view* items from actions like "Add view". If Shopify switches back to plain `menuitem`, we'll pick up action items too. |
| Active view | `aria-checked="true"` on the menuitemradio | If they replace with `aria-selected` or a visual-only indicator. |

If the console shows `no trigger found` on a list page where views clearly exist, inspect the current DOM (see "Locking new selectors" below) and update `SEL` in `content.js`.

## Locking new selectors

1. Open a Shopify list page with saved views.
2. Inspect the "All ⇅" trigger button → confirm it still has `aria-haspopup="menu"`. If not, update `SEL.trigger`.
3. Click it to open the menu, freeze the page with **DevTools → Sources → Pause script execution** (`F8`), then inspect one menu item. Confirm it still has `role="menuitemradio"`.
4. Walk up the DOM from the trigger. Confirm an ancestor still has `data-searchbar-plus="true"`. If not, pick the nearest stable attribute (prefer `data-*`, `aria-*`, or custom element tags like `<s-press-button>` over hashed Polaris class names which all look like `_Foo_ab12c_3`).
5. Reload the extension and refresh the Shopify tab.

## Known limitations

- **Dark mode** — colors are hardcoded for light admin. Will look out of place if you use Shopify admin in dark mode.
- **Rename/delete of a non-active view** — our cached label for that tab stays stale until a hard page refresh or `window.__viewsTabsRescan()`. We only auto-rescan when the *active* view label becomes one we don't recognize.
- **Reordering views** — our tabs keep the order from the first scan. Reorder in Shopify's native menu → force a rescan to pick up the new order.
- **Classic admin / non-SPA pages** — untested; extension assumes the current React admin.

## Roadmap

- **v0.1**: log-only. Validates selector correctness.
- **v0.2** (current): tab bar rendering with click-to-switch, active-view sync, rapid-click guard, manual rescan hook, auto-rescan on unknown active view.
- **Later**: dark mode support, optional setting to hide the original dropdown, popover-open mutation watching to catch all view list changes without flashing.
