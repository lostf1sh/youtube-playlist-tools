import { test, expect } from '@playwright/test';

test('renders extraction form', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'YouTube Playlist Extractor' })).toBeVisible();
  await expect(page.getByPlaceholder('https://www.youtube.com/playlist?list=...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Extract Playlist' })).toBeVisible();
});
