import { test, expect } from '@playwright/test';

test('renders race results, qualifying, and prediction against fixture data', async ({ page }) => {
  const response = await page.goto('/races/1');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('Italian Grand Prix').first()).toBeVisible();
  await expect(page.getByText('Monza', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Max Verstappen').first()).toBeVisible();

  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
});

test('renders the incidents tab with race control messages', async ({ page }) => {
  await page.goto('/races/1');

  await page.getByRole('tab', { name: 'Incidents' }).click();
  await expect(page.getByText('SAFETY CAR DEPLOYED')).toBeVisible();
  await expect(page.getByText('YELLOW IN TRACK SECTOR 4')).toBeVisible();
});
