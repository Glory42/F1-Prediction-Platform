import { test, expect } from '@playwright/test';

test('opens via keyboard shortcut, shows fixture results, and closes on Escape', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByPlaceholder(/search drivers, teams, and circuits/i)).not.toBeVisible();

  await page.keyboard.press('Control+k');

  const searchInput = page.getByPlaceholder(/search drivers, teams, and circuits/i);
  await expect(searchInput).toBeVisible();

  await expect(page.getByText('Max Verstappen').first()).toBeVisible();
  await expect(page.getByText('Ferrari').first()).toBeVisible();
  await expect(page.getByText('Autodromo Nazionale Monza').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(searchInput).not.toBeVisible();
});
