// Shopify Admin Saved Views Tabs — v0.2 (Stage 2: tab bar rendering)
//
// Locks real selectors from live Shopify DOM (2026-04):
//  - Filter bar scope:  [data-searchbar-plus="true"]   (stable data attribute)
//  - View trigger:      button[aria-haspopup="menu"] inside the searchbar
//  - Popover lookup:    trigger.aria-controls → element ID
//  - Menu items:        [role="menuitemradio"]         (NOT "menuitem" — that would
//                       also match "Add view" and management actions)
//  - Active view:       the menuitemradio with aria-checked="true"
//
// Toggle DEBUG live from DevTools console:
//   window.__viewsTabsDebug = false    // silence logs
//   window.__viewsTabsDebug = true     // re-enable (default)

const SEL = {
	searchBar: '[data-searchbar-plus="true"]',
	trigger: 'button[aria-haspopup="menu"]',
	menuItem: '[role="menuitemradio"]',
};

const BAR_ID = 'views-tabs-bar';

const log = (...args) => {
	if (window.__viewsTabsDebug !== false) console.log('[views-tabs]', ...args);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findTrigger() {
	const bar = document.querySelector(SEL.searchBar);
	if (!bar) return null;
	return bar.querySelector(SEL.trigger);
}

function findPopover(trigger) {
	const id = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
	if (id) {
		const el = document.getElementById(id);
		if (el) return el;
	}
	return document.querySelector('[role="menu"]');
}

// Walk up from the searchbar to the bordered Polaris-Box that wraps the
// whole filter row. Our tab bar is inserted as that element's previousSibling.
function findFilterRowAnchor(trigger) {
	const searchbar = trigger.closest(SEL.searchBar);
	if (!searchbar) return null;
	let node = searchbar;
	for (let i = 0; i < 10; i++) {
		const parent = node.parentElement;
		if (!parent) break;
		const style = parent.getAttribute('style') || '';
		if (style.includes('--pc-box-border-block-end-width')) return parent;
		node = parent;
	}
	let fallback = searchbar;
	for (let i = 0; i < 4 && fallback.parentElement; i++) fallback = fallback.parentElement;
	return fallback;
}

async function readViewsFromDropdown() {
	const trigger = findTrigger();
	if (!trigger) return [];

	const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
	if (!wasOpen) trigger.click();

	let popover = null;
	for (let i = 0; i < 40; i++) {
		popover = findPopover(trigger);
		if (popover && popover.querySelector(SEL.menuItem)) break;
		await sleep(25);
	}

	if (!popover) {
		if (!wasOpen) closeMenu(trigger);
		return [];
	}

	const items = [...popover.querySelectorAll(SEL.menuItem)];
	const views = items.map((el, index) => ({
		label: el.innerText.trim().replace(/\s+/g, ' '),
		checked: el.getAttribute('aria-checked') === 'true',
		index,
	}));

	if (!wasOpen) closeMenu(trigger);
	return views;
}

function closeMenu(trigger) {
	if (trigger?.getAttribute('aria-expanded') === 'true') {
		trigger.click();
	}
}

let activating = false;

async function activateView(view) {
	if (activating) return;
	activating = true;
	try {
		const trigger = findTrigger();
		if (!trigger) return;

		if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();

		for (let i = 0; i < 40; i++) {
			const popover = findPopover(trigger);
			const items = popover ? [...popover.querySelectorAll(SEL.menuItem)] : [];
			if (items.length) {
				let target = items.find(
					(el) => el.innerText.trim().replace(/\s+/g, ' ') === view.label
				);
				if (!target && view.index < items.length) target = items[view.index];
				if (target) {
					target.click();
					return;
				}
			}
			await sleep(25);
		}

		log('activateView: never found item for', view.label);
	} finally {
		activating = false;
	}
}

let activeObserver = null;

function observeActiveView(trigger, onChange) {
	activeObserver?.disconnect();
	const labelSpan = trigger.querySelector('s-internal-text') || trigger;
	activeObserver = new MutationObserver(() => {
		onChange(labelSpan.innerText.trim().replace(/\s+/g, ' '));
	});
	activeObserver.observe(labelSpan, {
		childList: true,
		subtree: true,
		characterData: true,
	});
}

function renderTabs(views, trigger) {
	document.getElementById(BAR_ID)?.remove();

	const anchor = findFilterRowAnchor(trigger);
	if (!anchor || !anchor.parentElement) return;

	const bar = document.createElement('div');
	bar.id = BAR_ID;

	for (const view of views) {
		const tab = document.createElement('button');
		tab.type = 'button';
		tab.className = 'views-tab';
		tab.textContent = view.label;
		tab.dataset.viewLabel = view.label;
		tab.dataset.viewIndex = String(view.index);
		if (view.checked) tab.setAttribute('aria-current', 'true');
		tab.addEventListener('click', () => {
			if (tab.getAttribute('aria-current') === 'true') return;
			for (const t of bar.querySelectorAll('.views-tab')) {
				t.removeAttribute('aria-current');
			}
			tab.setAttribute('aria-current', 'true');
			activateView(view);
		});
		bar.appendChild(tab);
	}

	anchor.after(bar);

	const activeTab = bar.querySelector('.views-tab[aria-current="true"]');
	if (activeTab) {
		bar.scrollLeft =
			activeTab.offsetLeft - bar.clientWidth / 2 + activeTab.clientWidth / 2;
	}

	observeActiveView(trigger, (currentLabel) => {
		const currentBar = document.getElementById(BAR_ID);
		if (!currentBar) return;
		const tabs = [...currentBar.querySelectorAll('.views-tab')];
		const match = tabs.find((t) => t.dataset.viewLabel === currentLabel);
		if (match) {
			for (const t of tabs) {
				if (t === match) t.setAttribute('aria-current', 'true');
				else t.removeAttribute('aria-current');
			}
		} else {
			// Active label isn't in our tab set — the view list changed (add/rename). Rescan.
			log('unknown active label, rescanning:', currentLabel);
			lastScannedPath = '';
			scheduleScan();
		}
	});
}

let lastScannedPath = '';
let scanning = false;
let scanTimer = 0;

async function maybeScan() {
	if (scanning) return;
	const path = location.pathname;
	const barExists = !!document.getElementById(BAR_ID);
	if (path === lastScannedPath && barExists) return;

	const trigger = findTrigger();
	if (!trigger) return;

	scanning = true;
	try {
		lastScannedPath = path;
		const views = await readViewsFromDropdown();
		const active = views.find((v) => v.checked);
		log('path:', path);
		log('views found:', views.map((v) => v.label));
		log('active view:', active?.label ?? '(none detected)');
		if (views.length) {
			renderTabs(views, findTrigger());
		}
	} catch (err) {
		log('scan error:', err);
	} finally {
		scanning = false;
	}
}

function scheduleScan() {
	clearTimeout(scanTimer);
	scanTimer = setTimeout(maybeScan, 150);
}

const mo = new MutationObserver(scheduleScan);
mo.observe(document.body, { childList: true, subtree: true });

// Manual rescan for debugging or when Shopify's DOM quietly drifts out from under us.
window.__viewsTabsRescan = () => {
	lastScannedPath = '';
	document.getElementById(BAR_ID)?.remove();
	scheduleScan();
};

scheduleScan();
