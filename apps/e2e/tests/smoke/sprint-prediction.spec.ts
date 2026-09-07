import { test, expect } from '@playwright/test';

test('renders the sprint prediction detail page against fixture data', async ({ page }) => {
  const response = await page.goto('/prediction/sprint/2');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('São Paulo Grand Prix').first()).toBeVisible();
  await expect(page.getByText('Max Verstappen').first()).toBeVisible();

  await expect(page.getByText(/no sprint prediction available/i)).toHaveCount(0);
  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
});
