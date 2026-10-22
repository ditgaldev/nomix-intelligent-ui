import { expect, test, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Simulate a background host update without a physical click stealing input focus.
const backgroundClick = (button: Locator) => button.evaluate(node => (node as HTMLButtonElement).click());
async function paintedPixels(canvas: Locator) {
  return canvas.evaluate(node => {
    const element = node as HTMLCanvasElement;
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let count = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) count++;
    return count;
  });
}

for (const framework of ['React', 'Vue']) {
  test(`${framework}: continuous updates preserve DOM, focus, input and open details`, async ({ page }) => {
    await page.goto('/updates');
    const instance = page.locator(`article[data-framework="${framework}"]`);
    const input = instance.getByRole('textbox', { name: '本地备注' });
    await input.fill(`${framework} draft`);
    await instance.getByText('查看图表数据', { exact: true }).click();
    await input.focus();
    const original = await input.elementHandle();
    const canvas = instance.locator('canvas');
    const originalCanvas = await canvas.elementHandle();
    await expect.poll(() => paintedPixels(canvas)).toBeGreaterThan(500);
    await backgroundClick(page.getByRole('button', { name: '更新数据', exact: true }));
    await expect(instance.locator('[data-display="MetricGroup"]')).toContainText('32');
    await expect(input).toHaveValue(`${framework} draft`);
    await expect(input).toBeFocused();
    await expect(instance.locator('details')).toHaveJSProperty('open', true);
    await expect(instance.locator('[data-display="DataTable"] tr').filter({ hasText: '样本 A' })).toContainText('32');
    await backgroundClick(page.getByRole('button', { name: '模拟旧版本', exact: true }));
    await expect(page.getByRole('status')).toContainText('旧版本已忽略');
    await expect(instance.locator('[data-display="MetricGroup"]')).toContainText('32');
    await backgroundClick(page.getByRole('button', { name: '追加内容', exact: true }));
    await expect(instance).toContainText('这段内容是后续追加的');
    await backgroundClick(page.getByRole('button', { name: '无效更新', exact: true }));
    await expect(instance.getByRole('alert')).toBeVisible();
    await expect(instance).toContainText('这段内容是后续追加的');
    await expect(input).toHaveValue(`${framework} draft`);
    await backgroundClick(page.getByRole('button', { name: '恢复界面', exact: true }));
    await expect(instance.getByRole('alert')).toHaveCount(0);
    await expect(input).toBeFocused();
    expect(await input.evaluate((node, before) => node === before, original)).toBe(true);
    expect(await canvas.evaluate((node, before) => node === before, originalCanvas)).toBe(true);
    await expect(instance.locator('details')).toHaveJSProperty('open', true);
    const other = page.locator(`article[data-framework="${framework === 'React' ? 'Vue' : 'React'}"]`);
    await expect(other.getByRole('textbox', { name: '本地备注' })).toHaveValue('');
    await backgroundClick(page.getByRole('button', { name: '开始新会话', exact: true }));
    await expect(input).toHaveValue('');
    await expect(instance.locator('details')).toHaveJSProperty('open', false);
    await backgroundClick(page.getByRole('button', { name: '模拟旧会话回包', exact: true }));
    await expect(page.getByRole('status')).toContainText('旧会话回包已忽略');
    await expect(instance.locator('[data-display="MetricGroup"]')).toContainText('30');
  });
}

test('display components paint real charts, retain raw values and fit both themes at 375px', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/updates');
  await mkdir('.artifacts/screenshots', { recursive: true });
  for (const framework of ['React', 'Vue']) {
    const instance = page.locator(`article[data-framework="${framework}"]`);
    await expect(instance.locator('[data-display]')).toHaveCount(5);
    await expect.poll(() => paintedPixels(instance.locator('canvas'))).toBeGreaterThan(500);
    const table = instance.locator('[data-display="DataTable"]');
    await expect(table.locator('tbody tr').nth(1).locator('td')).toHaveText(['样本 B', '0', 'false']);
    await expect(table.locator('tbody tr').nth(2).locator('td')).toHaveText(['样本 C', '—', 'false']);
    await expect(instance.locator('[data-display="Timeline"] li')).toHaveCount(2);
    await expect(instance.locator('[data-display="Steps"] li')).toHaveCount(3);
  }
  await page.screenshot({ path: '.artifacts/screenshots/updates-desktop-light.png', fullPage: true, animations: 'disabled' });
  const chart = page.locator('article[data-framework="React"] canvas');
  const light = await chart.evaluate(node => (node as HTMLCanvasElement).toDataURL());
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect.poll(() => chart.evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(light);
  await page.screenshot({ path: '.artifacts/screenshots/updates-desktop-dark.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 900 });
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: '切换主题' }).click();
    await expect(page.locator('.workbench')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `.artifacts/screenshots/updates-mobile-${theme}.png`, fullPage: true, animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});
