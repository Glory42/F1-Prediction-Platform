import { test, expect } from '@playwright/test';

test('renders the race-weekend sprint page with results and prediction against fixture data', async ({ page }) => {
  const response = await page.goto('/races/2/sprint');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('São Paulo Grand Prix').first()).toBeVisible();
  await expect(page.getByText('Max Verstappen').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /results/i })).toBeVisible();

  await expect(page.getByText(/sprint data not found/i)).toHaveCount(0);
  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
});
