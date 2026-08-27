import { test, expect } from '@playwright/test';

test('renders team stats and drivers against fixture data', async ({ page }) => {
  const response = await page.goto('/teams/1?year=2026');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('Red Bull Racing').first()).toBeVisible();
  await expect(page.getByText('Max Verstappen').first()).toBeVisible();
  await expect(page.getByText('Championship').first()).toBeVisible();

  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
  await expect(page.getByText('Team not found')).toHaveCount(0);
});
