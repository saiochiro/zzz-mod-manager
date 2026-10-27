// End-to-end checks of the core Library flows (spec Part 1 and the Part 4 smoke test), on the
// built-in sample mods (Ellen outfits, one of them off, a Miyabi mod that needs fixing, and more).
import { expect, test, type Locator, type Page } from '@playwright/test';

const ELLEN_ON = 'Casual Shark Hoodie Ellen';
const ELLEN_OFF = 'Victoria Gothic Combat Maid Ellen';
const MIYABI = 'Void Hunter Ceremonial Haori Miyabi';

const cards = (page: Page) => page.locator('article.mod-card');
const card = (page: Page, title: string) => cards(page).filter({ hasText: title });
const cardSwitch = (page: Page, title: string) => card(page, title).getByRole('switch');
const statPill = (page: Page, text: string | RegExp) => page.locator('.stat-pill', { hasText: text });
const searchBox = (page: Page) => page.getByPlaceholder('Search mods, creators, characters');
const statusTab = (page: Page, label: string) => page.getByRole('tablist', { name: 'Filter by status' }).getByText(label, { exact: true });
const sortSelect = (page: Page) => page.locator('select').filter({ has: page.locator('option[value="size"]') });
/** How many mods are installed, as the "installed" pill says. */
const installed = async (page: Page) => Number(await statPill(page, 'installed').locator('strong').innerText());
const expectAll = async (page: Page) => expect(cards(page)).toHaveCount(await installed(page));
const cardTitles = async (page: Page) => (await cards(page).locator('.mod-card__title').allInnerTexts()).map((t) => t.trim());

test.beforeEach(async ({ page }) => {
  // Skip the first-run tour and always start on the Library.
  await page.addInitScript(() => {
    localStorage.setItem('proxylaunch_setup_v2', 'done');
    localStorage.setItem('pl_last_screen', 'library');
    localStorage.removeItem('pl_library_agent');
  });
  await page.goto('/');
  await expect(cards(page).first()).toBeVisible();
});

/** The element is what you'd click at its centre: nothing else is drawn over it. */
async function expectOnTop(el: Locator) {
  await expect(el).toBeVisible();
  const onTop = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
    return !!hit && (hit === node || node.contains(hit));
  });
  expect(onTop, 'nothing should cover it').toBe(true);
}

test('the Library shows every sample mod', async ({ page }) => {
  expect(await installed(page)).toBeGreaterThanOrEqual(5);
  await expectAll(page);
  for (const t of [ELLEN_ON, ELLEN_OFF, MIYABI]) await expect(card(page, t)).toHaveCount(1);
});

test('search and the status filter narrow the grid, and clearing brings everything back', async ({ page }) => {
  await searchBox(page).fill('Miyabi');
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, MIYABI)).toBeVisible();
  await searchBox(page).fill('');
  await expectAll(page);

  await statusTab(page, 'Off').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, ELLEN_OFF)).toBeVisible();
  await statusTab(page, 'All').click();
  await expectAll(page);
});

test('the status pills filter and toggle back', async ({ page }) => {
  const attention = statPill(page, 'need attention');
  await attention.click();
  const shown = await cards(page).count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(await installed(page));
  await expect(card(page, MIYABI)).toBeVisible();
  await attention.click(); // again: back to everything
  await expectAll(page);

  const onPill = statPill(page, / on$/);
  await onPill.click();
  await expect(card(page, ELLEN_OFF)).toHaveCount(0);
  await onPill.click();
  await expectAll(page);
});

test('picking a character after Needs attention shows all of that character', async ({ page }) => {
  await statPill(page, 'need attention').click();
  await searchBox(page).fill('Ellen');
  await searchBox(page).fill('');
  await statPill(page, 'installed').click();
  await expectAll(page);
});

test('the card switch turns a mod off and on, and it sticks after a reload', async ({ page }) => {
  const sw = cardSwitch(page, ELLEN_ON);
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, ELLEN_ON)).toHaveClass(/is-off/);
  await page.reload();
  await expect(cardSwitch(page, ELLEN_ON)).toHaveAttribute('aria-checked', 'false');
  await cardSwitch(page, ELLEN_ON).click();
  await expect(cardSwitch(page, ELLEN_ON)).toHaveAttribute('aria-checked', 'true');
});

test('the details drawer opens on its tabs and closes with Escape', async ({ page }) => {
  await card(page, MIYABI).locator('.mod-card__title').click();
  const drawer = page.locator('aside.drawer[role="dialog"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await drawer.getByRole('tab', { name: /Hotkeys/ }).click();
  await expect(drawer.getByRole('tab', { name: /Hotkeys/ })).toHaveAttribute('aria-selected', 'true');
  await drawer.getByRole('tab', { name: 'Advanced' }).click();
  await expect(drawer.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
  await expectOnTop(drawer.getByRole('tab', { name: 'Overview' }));
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});

test('menus, the activity panel and dialogs sit on top of everything', async ({ page }) => {
  // A card's menu over the cards below it.
  await card(page, ELLEN_ON).getByRole('button', { name: 'More actions' }).click();
  const cardMenu = page.getByRole('menu');
  await expectOnTop(cardMenu.getByRole('menuitem').first());
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);

  // The activity panel over the Library.
  const activityBtn = page.getByRole('button', { name: /^Activity/ });
  await activityBtn.click();
  await expectOnTop(page.getByLabel('Recent activity'));
  await activityBtn.click();

  // A dialog over the page and its toolbar.
  await page.getByRole('button', { name: 'Library tools' }).click();
  const importItem = page.getByRole('menu').getByText('Import from another launcher');
  await expectOnTop(importItem);
  await importItem.click();
  const dialog = page.locator('.overlay [role="dialog"]').first();
  await expectOnTop(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('sorting by name lists the mods A to Z', async ({ page }) => {
  await sortSelect(page).selectOption('alphabetical');
  const titles = await cardTitles(page);
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  await sortSelect(page).selectOption('size');
  await expectAll(page);
});

test('bulk select turns several mods off and back on together', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await card(page, ELLEN_ON).click();
  await card(page, MIYABI).click();
  const bar = page.getByRole('toolbar', { name: 'Selected mods' });
  await expect(bar).toContainText('2 selected');
  await bar.getByRole('button', { name: 'Turn off' }).click();
  await expect(cardSwitch(page, ELLEN_ON)).toHaveAttribute('aria-checked', 'false');
  await expect(cardSwitch(page, MIYABI)).toHaveAttribute('aria-checked', 'false');
  await bar.getByRole('button', { name: 'Turn on' }).click();
  await expect(cardSwitch(page, ELLEN_ON)).toHaveAttribute('aria-checked', 'true');
  await expect(cardSwitch(page, MIYABI)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
});

test('offline: the Library still works and Browse says it is offline', async ({ page }) => {
  // The web build talks to its backend over HTTP, so the network can't really be cut here; the app
  // is told it's offline the way Windows tells it (navigator.onLine and the "offline" event).
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  const sw = cardSwitch(page, ELLEN_ON);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');

  await page.locator('button[title="Browse"]').click();
  await expect(page.getByText('You’re offline').first()).toBeVisible();
});

test('a deleted mod goes to Recently deleted and can be put back', async ({ page }) => {
  const JANE = 'Shadow Operative Tactical Suit Jane Doe';
  const before = await installed(page);
  await card(page, JANE).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete mod' }).click();
  await page.getByRole('menuitem', { name: 'Click again to delete' }).click();
  await expect(card(page, JANE)).toHaveCount(0);
  await expect(statPill(page, 'installed').locator('strong')).toHaveText(String(before - 1));

  await page.getByRole('button', { name: /Recently deleted \(1\)/ }).click();
  const dialog = page.locator('.overlay [role="dialog"]').first();
  await expectOnTop(dialog);
  const row = dialog.locator('.backups__row', { hasText: JANE });
  await row.getByRole('button', { name: 'Put back' }).click();
  await expect(card(page, JANE)).toHaveCount(1);
  await expect(statPill(page, 'installed').locator('strong')).toHaveText(String(before));
});

test('Settings shows the Backups section without errors', async ({ page }) => {
  await page.locator('button[title="Settings"]').click();
  const section = page.locator('#settings-backups');
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { name: 'Backups' })).toBeVisible();
  await expect(page.locator('.toast--error')).toHaveCount(0);
});
