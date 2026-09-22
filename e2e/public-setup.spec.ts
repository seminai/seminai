import { expect, test } from '@playwright/test';

test('public runtime config is available without auth', async ({ request }) => {
  const response = await request.get('/config/public');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data?: { inviteRequired?: boolean } };
  expect(body.data?.inviteRequired).toBe(true);
});

test('setup wizard HTML is served', async ({ page }) => {
  const response = await page.goto('/setup');
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
});

test('LLM provider catalog is public', async ({ request }) => {
  const response = await request.get('/llm/providers/detect');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { data?: { providers?: unknown[] } };
  expect(Array.isArray(body.data?.providers)).toBe(true);
});
