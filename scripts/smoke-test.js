/**
 * 回归测试
 *
 * 用法：
 *   npm test
 *   CHROME_PATH="/path/to/chrome" npm test
 *
 * 覆盖：三制式换算、四状态判断、等级制成绩、课程类型与统计口径、
 *       批量导入、撤销删除、数据校验、备份导出、旧版本数据迁移、分享卡生成。
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
const readWarn = (page) => page.evaluate(() => {
  const el = document.getElementById('dataWarn');
  return el.classList.contains('on') ? el.innerText : '';
});

(async () => {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  );
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(PAGE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  console.log('\n[1] 空状态');
  check('徽章为待录入', await read(page, 'verdictPill'), '待录入');
  check('已修学分为 0', await read(page, 'curCredit'), '0');

  console.log('\n[2] 示例数据（4.0 制，含等级制与不计入绩点课程）');
  await page.click('#demoBtn');
  await page.waitForTimeout(250);
  check('加权绩点', await read(page, 'curGpa'), '3.55');
  check('加权平均分', await read(page, 'curScore'), '86.0');
  check('已修学分（含不计入绩点的课程）', await read(page, 'curCredit'), '21.5');
  check('剩余所需', await read(page, 'needVal'), '3.65');
  check('状态为需要冲刺', await read(page, 'verdictPill'), '需要冲刺');
  check('课程总数', await read(page, 'courseCount'), '7 门');
  checkTruthy('提示等级制按中值估算', (await readWarn(page)).includes('等级制'));
  checkTruthy('提示不计入绩点课程', (await readWarn(page)).includes('不计入绩点'));

  console.log('\n[3] 统计口径切换为「仅必修」');
  await page.click('#scopeSeg button[data-scope="required"]');
  await page.waitForTimeout(200);
  check('必修加权绩点', await read(page, 'curGpa'), '3.53');
  check('必修学分', await read(page, 'curCredit'), '18.5');
  check('课程数含必修门数', await read(page, 'courseCount'), '7 门 · 必修 5 门');
  await page.click('#scopeSeg button[data-scope="all"]');
  await page.waitForTimeout(150);

  console.log('\n[4] 超出可达范围');
  await page.fill('#target', '4.0');
  await page.fill('#remain', '8');
  await page.waitForTimeout(200);
  check('状态', await read(page, 'verdictPill'), '超出可达范围');
  check('剩余所需', await read(page, 'needVal'), '5.16');
  checkTruthy('文案给出满绩上限 3.68', (await readNote(page)).includes('3.68'));

  console.log('\n[5] 可以达成');
  await page.fill('#target', '3.3');
  await page.fill('#remain', '24');
  await page.waitForTimeout(200);
  check('状态', await read(page, 'verdictPill'), '可以达成');
  check('剩余所需', await read(page, 'needVal'), '3.09');
  checkTruthy('分档换算正确（3.09 → 82 分档）', (await readNote(page)).includes('82'));

  console.log('\n[6] 切换到百分制');
  await page.click('#seg button[data-s="100"]');
  await page.waitForTimeout(200);
  check('主指标为加权平均分', await read(page, 'curGpa'), '86.0');
  check('第二格改为课程门数', await read(page, 'curScoreLabel'), '课程门数');
  check('课程门数', await read(page, 'curScore'), '7');
  check('目标按比例换算（3.3/4.0 → 83/100）', await page.inputValue('#target'), '83');

  console.log('\n[7] 切换到 5.0 制');
  await page.click('#seg button[data-s="5.0"]');
  await page.waitForTimeout(200);
  check('目标按比例换算（83/100 → 4.15/5.0）', await page.inputValue('#target'), '4.15');

  console.log('\n[8] 批量导入（含类型与等级成绩）');
  await page.click('#seg button[data-s="4.0"]');
  await page.click('#clearBtn');
  await page.click('#batchBtn');
  await page.fill('#batchText', '概率论 3 90 必修\n大学化学 2 良\n信号与系统 4 85 通识');
  await page.click('#batchOk');
  await page.waitForTimeout(250);
  check('导入 3 门', await read(page, 'courseCount'), '3 门');
  check('等级制成绩被解析（良→85）', await page.evaluate(() => {
    const marks = document.querySelectorAll('#courseList .gauge-num');
    return marks[1] ? marks[1].textContent : '';
  }), '≈85');
  check('类型按行解析（第 3 门为通识）', await page.evaluate(() => {
    const sels = document.querySelectorAll('#courseList select');
    return sels[2] ? sels[2].value : '';
  }), 'general');

  console.log('\n[9] 刷新后持久化');
  await page.reload();
  await page.waitForTimeout(350);
  check('刷新后仍是 3 门', await read(page, 'courseCount'), '3 门');

  console.log('\n[10] 删除与撤销');
  await page.click('#courseList .cr:first-child .del');
  await page.waitForTimeout(200);
  check('删除后剩 2 门', await read(page, 'courseCount'), '2 门');
  await page.click('#toast .undo');
  await page.waitForTimeout(250);
  check('撤销后恢复 3 门', await read(page, 'courseCount'), '3 门');

  console.log('\n[11] 非法成绩校验');
  await page.click('#addCourse');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const rows = document.querySelectorAll('#courseList .cr');
    const last = rows[rows.length - 1];
    const credit = last.querySelector('[data-f="credit"]');
    credit.value = '2';
    credit.dispatchEvent(new Event('input', { bubbles: true }));
    const score = last.querySelector('[data-f="score"]');
    score.value = 'abc';
    score.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  checkTruthy('出现数据不完整提示', (await readWarn(page)).includes('数据不完整'));
  checkTruthy('该行标记为异常', await page.evaluate(() => {
    const rows = document.querySelectorAll('#courseList .cr');
    return rows[rows.length - 1].classList.contains('bad');
  }));
  await page.click('#courseList .cr:last-child .del');
  await page.waitForTimeout(200);

  console.log('\n[12] 导出备份（JSON）');
  const dlJson = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('#exportJson');
  const fJson = await dlJson;
  checkTruthy('触发 JSON 下载', !!fJson);
  if (fJson) checkTruthy('文件名含 .json', fJson.suggestedFilename().endsWith('.json'));

  console.log('\n[13] 导出课程表（CSV）');
  const dlCsv = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('#exportCsv');
  const fCsv = await dlCsv;
  checkTruthy('触发 CSV 下载', !!fCsv);
  if (fCsv) checkTruthy('文件名含 .csv', fCsv.suggestedFilename().endsWith('.csv'));

  console.log('\n[14] 分享卡生成');
  await page.click('#exportBtn');
  await page.waitForTimeout(900);
  checkTruthy('弹窗打开', await page.evaluate(() => document.getElementById('cardModal').classList.contains('on')));
  checkTruthy('图片已生成', (await page.evaluate(() => document.getElementById('cardImg').src.length)) > 1000);
  await page.click('#cardClose');

  console.log('\n[15] 旧版本数据迁移（v1 → v2）');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gpa-planner-v1', JSON.stringify({
      scale: '4.0',
      courses: [{ name: '旧版课程', credit: '3', score: '90' }],
      target: 3.7,
      remain: 12,
      sim: 85
    }));
  });
  await page.reload();
  await page.waitForTimeout(350);
  check('迁移后读到 1 门课程', await read(page, 'courseCount'), '1 门');
  check('补全默认类型为必修', await page.evaluate(() => {
    const sel = document.querySelector('#courseList select');
    return sel ? sel.value : '';
  }), 'required');
  check('迁移后写入新存储键', await page.evaluate(() => !!localStorage.getItem('gpa-planner-data')), true);

  check('全程无运行时报错', errors.length, 0);

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
