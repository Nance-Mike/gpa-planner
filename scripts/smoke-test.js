/**
 * 回归测试：三制式 × 四状态
 *
 * 用法：
 *   npm test
 *   CHROME_PATH="/path/to/chrome" npm test
 *
 * 覆盖：空状态、可以达成、需要冲刺、超出可达范围、制式切换、
 *       批量导入、刷新持久化、分享卡生成。
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');

const INDEX = path.resolve(__dirname, '..', 'index.html');
const PAGE_URL = pathToFileURL(INDEX).href;

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}：期望 ${expected}，实际 ${actual}`);
    console.log(`  ✗ ${name}：期望 ${expected}，实际 ${actual}`);
  }
}

function checkTruthy(name, actual) {
  const ok = Boolean(actual);
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}：结果为假`);
    console.log(`  ✗ ${name}：结果为假`);
  }
}

const read = (page, id) => page.evaluate((x) => document.getElementById(x).textContent, id);
const readNote = (page) => page.evaluate(() => document.getElementById('verdictNote').innerText);

(async () => {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(PAGE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('\n[1] 空状态');
  check('徽章为待录入', await read(page, 'verdictPill'), '待录入');
  check('已修学分为 0', await read(page, 'curCredit'), '0');

  console.log('\n[2] 4.0 制示例数据');
  await page.click('#demoBtn');
  await page.waitForTimeout(200);
  check('加权绩点', await read(page, 'curGpa'), '3.48');
  check('加权平均分', await read(page, 'curScore'), '85.4');
  check('已修学分', await read(page, 'curCredit'), '20.5');
  check('剩余所需', await read(page, 'needVal'), '3.72');
  check('状态为需要冲刺', await read(page, 'verdictPill'), '需要冲刺');
  checkTruthy('文案含分档提示', (await readNote(page)).includes('分档'));

  console.log('\n[3] 超出可达范围');
  await page.fill('#target', '4.0');
  await page.fill('#remain', '8');
  await page.waitForTimeout(150);
  check('状态', await read(page, 'verdictPill'), '超出可达范围');
  check('剩余所需超出满分', await read(page, 'needVal'), '5.33');
  checkTruthy('文案给出满绩上限', (await readNote(page)).includes('3.63'));

  console.log('\n[4] 可以达成');
  await page.fill('#target', '3.3');
  await page.fill('#remain', '24');
  await page.waitForTimeout(150);
  check('状态', await read(page, 'verdictPill'), '可以达成');
  check('剩余所需', await read(page, 'needVal'), '3.15');
  checkTruthy('分档换算正确（3.15 → 82 分档）', (await readNote(page)).includes('82'));

  console.log('\n[5] 切换到百分制');
  await page.click('#seg button[data-s="100"]');
  await page.waitForTimeout(200);
  check('主指标为加权平均分', await read(page, 'curGpa'), '85.4');
  check('第二格改为课程门数', await read(page, 'curScoreLabel'), '课程门数');
  check('课程门数', await read(page, 'curScore'), '6');
  check('目标按比例换算（3.3/4.0 → 83/100）', await page.inputValue('#target'), '83');

  console.log('\n[6] 切换到 5.0 制');
  await page.click('#seg button[data-s="5.0"]');
  await page.waitForTimeout(200);
  check('目标按比例换算（83/100 → 4.15/5.0）', await page.inputValue('#target'), '4.15');

  console.log('\n[7] 批量导入');
  await page.click('#seg button[data-s="4.0"]');
  await page.click('#clearBtn');
  await page.click('#batchBtn');
  await page.fill('#batchText', '概率论 3 90\n大学化学\t2\t77\n信号与系统 4 85');
  await page.click('#batchOk');
  await page.waitForTimeout(200);
  check('导入 3 门', await read(page, 'courseCount'), '3 门');

  console.log('\n[8] 刷新后持久化');
  await page.reload();
  await page.waitForTimeout(300);
  check('刷新后仍是 3 门', await read(page, 'courseCount'), '3 门');

  console.log('\n[9] 分享卡生成');
  await page.click('#exportBtn');
  await page.waitForTimeout(800);
  checkTruthy('弹窗打开', await page.evaluate(() => document.getElementById('cardModal').classList.contains('on')));
  checkTruthy('图片已生成', (await page.evaluate(() => document.getElementById('cardImg').src.length)) > 1000);

  check('无运行时报错', errors.length, 0);

  await browser.close();

  console.log(`\n通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length) {
    console.log(failures.map((f) => '  - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('全部通过。');
})().catch((e) => {
  console.error('测试执行失败：', e.message);
  process.exit(1);
});
