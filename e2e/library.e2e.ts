// End-to-end checks of the core Library flows (spec Part 1 and the Part 4 smoke test), on the
// built-in sample mods: 3 Ellen outfits (one off), a Miyabi mod that needs fixing, a Jane mod.
import { expect, test, type Locator, type Page } from '@playwright/test';

const ELLEN_ON = 'Casual Shark Hoodie Ellen';
const ELLEN_OFF = 'Victoria Gothic Combat Maid Ellen';
const MIYABI = 'Void Hunter Ceremonial Haori Miyabi';

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

const cards = (page: Page) => page.locator('article.mod-card');
const card = (page: Page, title: string) => cards(page).filter({ hasText: title });
const cardTitles = async (page: Page) => (await page.locator('article.mod-card .mod-card__title').allInnerTexts()).map((t) => t.trim());

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
  await expect(cards(page)).toHaveCount(5);
  for (const t of [ELLEN_ON, ELLEN_OFF, MIYABI]) await expect(card(page, t)).toHaveCount(1);
});

test('search and the status filter narrow the grid, and clearing brings everything back', async ({ page }) => {
  await page.getByPlaceholder('Search mods, creators, characters').fill('Miyabi');
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, MIYABI)).toBeVisible();
  await page.getByPlaceholder('Search mods, creators, characters').fill('');
  await expect(cards(page)).toHaveCount(5);

  await page.getByRole('tablist', { name: 'Filter by status' }).getByText('Off', { exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, ELLEN_OFF)).toBeVisible();
  await page.getByRole('tablist', { name: 'Filter by status' }).getByText('All', { exact: true }).click();
  await expect(cards(page)).toHaveCount(5);
});

test('the status pills filter and toggle back', async ({ page }) => {
  const attention = page.locator('.stat-pill', { hasText: 'need attention' });
  await attention.click();
  const shown = await cards(page).count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(5);
  await expect(card(page, MIYABI)).toBeVisible();
  await attention.click(); // again: back to everything
  await expect(cards(page)).toHaveCount(5);

  const onPill = page.locator('.stat-pill', { hasText: / on$/ });
  await onPill.click();
  await expect(card(page, ELLEN_OFF)).toHaveCount(0);
  await onPill.click();
  await expect(cards(page)).toHaveCount(5);
});

test('picking a character after Needs attention shows all of that character', async ({ page }) => {
  await page.locator('.stat-pill', { hasText: 'need attention' }).click();
  await page.getByPlaceholder('Search mods, creators, characters').fill('Ellen');
  await page.getByPlaceholder('Search mods, creators, characters').fill('');
  await page.locator('.stat-pill', { hasText: 'installed' }).click();
  await expect(cards(page)).toHaveCount(5);
});

test('the card switch turns a mod off and on, and it sticks after a reload', async ({ page }) => {
  const sw = card(page, ELLEN_ON).getByRole('switch');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, ELLEN_ON)).toHaveClass(/is-off/);
  await page.reload();
  await expect(card(page, ELLEN_ON).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await card(page, ELLEN_ON).getByRole('switch').click();
  await expect(card(page, ELLEN_ON).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
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
  const cardMenu = card(page, ELLEN_ON).getByRole('menu');
  await expectOnTop(cardMenu.getByRole('menuitem').first());
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);

  // The activity panel over the Library.
  await page.getByRole('button', { name: /^Activity/ }).click();
  const activity = page.getByLabel('Recent activity');
  await expectOnTop(activity);
  await page.getByRole('button', { name: /^Activity/ }).click();

  // A dialog over the page and its toolbar.
  await page.getByRole('button', { name: 'Library tools' }).click();
  await expectOnTop(page.getByRole('menu').getByText('Import from another launcher'));
  await page.getByRole('menu').getByText('Import from another launcher').click();
  const dialog = page.locator('.overlay [role="dialog"]').first();
  await expectOnTop(dialog);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('sorting by name lists the mods A to Z', async ({ page }) => {
  await page.locator('select').filter({ has: page.locator('option[value="size"]') }).selectOption('alphabetical');
  const titles = await cardTitles(page);
  expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  await page.locator('select').filter({ has: page.locator('option[value="size"]') }).selectOption('size');
  await expect(cards(page)).toHaveCount(5);
});

test('bulk select turns several mods off and back on together', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await card(page, ELLEN_ON).click();
  await card(page, MIYABI).click();
  const bar = page.getByRole('toolbar', { name: 'Selected mods' });
  await expect(bar).toContainText('2 selected');
  await bar.getByRole('button', { name: 'Turn off' }).click();
  await expect(card(page, ELLEN_ON).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, MIYABI).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await bar.getByRole('button', { name: 'Turn on' }).click();
  await expect(card(page, ELLEN_ON).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await expect(card(page, MIYABI).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
});

test('offline: the Library still works and Browse says it is offline', async ({ page }) => {
  // The web build talks to its backend over HTTP, so the network can't really be cut here; the app
  // is told it's offline the way Windows tells it (navigator.onLine and the "offline" event).
  const goOffline = () =>
    page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
  await goOffline();
  const sw = card(page, ELLEN_ON).getByRole('switch');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');

  await page.locator('button[title="Browse"]').click();
  await expect(page.getByText('You’re offline').first()).toBeVisible();
});
