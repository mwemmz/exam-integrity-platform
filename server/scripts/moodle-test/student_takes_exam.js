// Drives a headless browser: Moodle student logs in, launches ExamTech via LTI, takes exam 1 and submits it.
// Needs `playwright` (npm i playwright). Credentials/URLs match setup_moodle.php and README.md in this folder.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, permissions: ['camera', 'microphone'] });
  const page = await ctx.newPage();
  page.on('response', r => { const u = r.url(); if (u.includes('/api/') && r.request().method() !== 'GET') console.log('RESP', r.request().method(), r.status(), u.replace('http://localhost:3000','').slice(0, 90)); });
  await page.goto('http://localhost:8080/login/index.php');
  await page.fill('#username', 'smith'); await page.fill('#password', 'Student#12345!'); await page.click('#loginbtn');
  await page.waitForLoadState('networkidle');
  await page.goto('http://localhost:8080/mod/lti/launch.php?id=2&triggerview=0', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  if (/consent/.test(page.url())) await page.click('text=I understand and agree to begin');
  await page.waitForTimeout(3000);
  console.log('url', page.url());
  page.on('dialog', d => d.accept());
  await page.locator('input[type=checkbox]').nth(1).check().catch(e => console.log('mcq err', e.message.slice(0,80)));
  const tas = await page.$$('textarea');
  console.log('textareas', tas.length);
  if (tas[0]) await tas[0].fill('Water evaporates, condenses into clouds, falls as rain and collects again.');
  if (tas[1]) await tas[1].fill('function rev(s){ return s.split("").reverse().join(""); }');
  await page.waitForTimeout(1500);
  await page.click('text=Submit Exam');
  await page.waitForTimeout(1500);
  await page.waitForTimeout(5000);
  console.log('final url', page.url());
  console.log((await page.innerText('body')).slice(0, 400));
  await browser.close();
})();
