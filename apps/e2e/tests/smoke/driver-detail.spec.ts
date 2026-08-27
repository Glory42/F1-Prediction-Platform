import { test, expect } from '@playwright/test';

test('renders driver stats and recent results against fixture data', async ({ page }) => {
  const response = await page.goto('/drivers/10?year=2026');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('Max Verstappen').first()).toBeVisible();
  await expect(page.getByText('Red Bull Racing').first()).toBeVisible();
  await expect(page.getByText('Championship').first()).toBeVisible();
  await expect(page.getByText('Italian Grand Prix').first()).toBeVisible();

  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
  await expect(page.getByText('Driver not found')).toHaveCount(0);
});
