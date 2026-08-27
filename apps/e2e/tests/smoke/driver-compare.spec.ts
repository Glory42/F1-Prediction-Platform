import { test, expect } from '@playwright/test';

test('renders both drivers season comparison from URL params against fixture data', async ({ page }) => {
  const response = await page.goto('/drivers/compare?year=2025&a=10&b=11');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('Max Verstappen').first()).toBeVisible();
  await expect(page.getByText('Charles Leclerc').first()).toBeVisible();
  await expect(page.getByText('Championship Points').first()).toBeVisible();

  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
});
