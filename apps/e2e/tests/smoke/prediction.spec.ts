import { test, expect } from '@playwright/test';

test('renders the upcoming prediction and history against fixture data', async ({ page }) => {
  const response = await page.goto('/prediction');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('Max Verstappen').first()).toBeVisible();
  await expect(page.getByText('Italian Grand Prix').first()).toBeVisible();

  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
});
