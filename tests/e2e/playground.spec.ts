import { test, expect } from '@playwright/test';

test('same Spec, isolated interactions, saved state and real HTTP refresh', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const react = page.locator('article[data-framework="React"]');
  const vue = page.locator('article[data-framework="Vue"]');
  await expect(react.getByText('¥ 128,600', { exact: true })).toBeVisible();
  await expect(vue.getByText('¥ 128,600', { exact: true })).toBeVisible();
  await react.getByLabel('报告备注').fill('React 单独保存');
  await vue.getByLabel('报告备注').fill('Vue 单独保存');
  await react.getByLabel('标记已核对退货数据').check();
  await expect(vue.getByLabel('标记已核对退货数据')).not.toBeChecked();
  await page.getByRole('button', { name: '保存 React', exact: true }).click();
  await react.getByLabel('报告备注').fill('后来改动');
  await page.getByRole('button', { name: '恢复 React', exact: true }).click();
  await expect(react.getByLabel('报告备注')).toHaveValue('React 单独保存');
  await expect(vue.getByLabel('报告备注')).toHaveValue('Vue 单独保存');
  for (const frame of [react, vue]) {
    await frame.getByRole('combobox', { name: '统计月份' }).click();
    await frame.getByRole('option', { name: '2026-09', exact: true }).click();
    await expect(frame.getByText('¥ 114,300', { exact: true })).toBeVisible();
    await expect(frame.getByRole('button', { name: '刷新销售数据', exact: true })).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('fixed and slotted compositions, streaming and invalid Spec guard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /固定组件.*宿主定义销售摘要/ }).click();
  await expect(page.locator('.demo-summary')).toHaveCount(2);
  await page.getByRole('button', { name: /插槽组合.*受约束布局嵌套固定组件/ }).click();
  await expect(page.getByText('月度经营报告', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '流式演示', exact: true }).click();
  await expect(page.getByRole('button', { name: '流式演示', exact: true })).toBeEnabled();
  await expect(page.getByText('月度经营报告', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: '查看 Spec', exact: true }).click();
  await page.getByRole('button', { name: '测试非法 Spec 拦截', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('拦截');
});

test('theme stays with each dropdown and page fits a phone', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: '.artifacts/screenshots/desktop-light.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  for (const name of ['React', 'Vue']) {
    const frame = page.locator(`article[data-framework="${name}"]`);
    await frame.getByRole('combobox', { name: '统计月份' }).click();
    const option = frame.getByRole('option', { name: '2026-09', exact: true });
    await expect(option).toBeVisible();
    expect(await option.evaluate(element => element.closest('.nomix-ui')?.getAttribute('data-theme'))).toBe('dark');
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: '.artifacts/screenshots/desktop-dark.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('.nomix-ui[data-theme="light"]')).toHaveCount(2);
  await expect(page.locator('.workbench')).toHaveCSS('background-color', 'rgb(245, 245, 240)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('article[data-framework="Vue"]').getByLabel('报告备注')).toBeVisible();
  await page.screenshot({ path: '.artifacts/screenshots/mobile-light.png', fullPage: true, animations: 'disabled' });
});

test('business request failure is visible and retry succeeds', async ({ page }) => {
  await page.goto('/');
  const react = page.locator('article[data-framework="React"]');
  await expect(react.getByRole('button', { name: '刷新销售数据', exact: true })).toBeEnabled();
  await page.route('**/api/sales', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试服务暂不可用' }) }), { times: 1 });
  await react.getByRole('button', { name: '刷新销售数据', exact: true }).click();
  await expect(react).toContainText('测试服务暂不可用');
  await expect(react.getByRole('button', { name: '刷新销售数据', exact: true })).toBeEnabled();
  await react.getByRole('button', { name: '刷新销售数据', exact: true }).click();
  await expect(react).not.toContainText('测试服务暂不可用');
});
