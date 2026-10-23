/**
 * 生成 README 文档所用的截图。
 *
 * 用法：
 *   npm run screenshots
 *   CHROME_PATH="/path/to/chrome" npm run screenshots
 *
 * 输出（screenshots/）：
 *   01-panel.png            移动端首屏：现状 + 目标 + 结论
 *   02-courses.png          移动端：课程表与操作区
 *   03-help.png             移动端：使用说明与换算规则
 *   share-card-gpa4.png     4.0 制分享卡（1080×1350）
 *   share-card-score100.png 百分制分享卡（1080×1350）
 */

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');

const INDEX = path.resolve(__dirname, '..', 'index.html');
const OUT_DIR = path.resolve(__dirname, '..', 'screenshots');
const PAGE_URL = pathToFileURL(INDEX).href;

/** 生成一张分享卡并保存到 screenshots/ */
async function saveShareCard(page, fileName) {
  await page.click('#exportBtn');
  await page.waitForSelector('#cardModal.on', { timeout: 5000 });
  await page.waitForTimeout(400);

  const download = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('#cardDl');
  const file = await download;
  if (!file) throw new Error('分享卡下载失败：' + fileName);
  await file.saveAs(path.join(OUT_DIR, fileName));
  await page.click('#cardClose');
  console.log('  ✓ ' + fileName);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );

  // ---- 移动端界面截图 ----
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 3,
    isMobile: true
  });
  const m = await mobile.newPage();
  await m.goto(PAGE_URL);
  await m.evaluate(() => localStorage.clear());
  await m.reload();
  await m.click('#demoBtn');
  await m.waitForTimeout(2200); // 等提示条消失
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.waitForTimeout(300);

  await m.screenshot({ path: path.join(OUT_DIR, '01-panel.png') });
  console.log('  ✓ 01-panel.png');

  await m.evaluate(() => document.getElementById('coursesCard').scrollIntoView({ block: 'start' }));
  await m.waitForTimeout(300);
  await m.screenshot({ path: path.join(OUT_DIR, '02-courses.png') });
  console.log('  ✓ 02-courses.png');

  await m.evaluate(() => {
    document.querySelector('details.help').open = true;
    document.querySelector('details.help').scrollIntoView({ block: 'start' });
  });
  await m.waitForTimeout(300);
  await m.screenshot({ path: path.join(OUT_DIR, '03-help.png') });
  console.log('  ✓ 03-help.png');

  // ---- 分享卡（两种口径）----
  const desktop = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  const d = await desktop.newPage();
  await d.goto(PAGE_URL);
  await d.evaluate(() => localStorage.clear());
  await d.reload();
  await d.click('#demoBtn');
  await d.waitForTimeout(300);

  await saveShareCard(d, 'share-card-gpa4.png');

  await d.click('#seg button[data-s="100"]');
  await d.waitForTimeout(300);
  await saveShareCard(d, 'share-card-score100.png');

  await browser.close();
  console.log('\n截图已输出到 screenshots/');
})().catch((e) => {
  console.error('截图生成失败：', e.message);
  process.exit(1);
});
