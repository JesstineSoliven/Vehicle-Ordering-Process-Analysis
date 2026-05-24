import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SCREENSHOT_DIR = path.join(__dirname, 'temporary screenshots');

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] || '';

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
const existing = fs.readdirSync(SCREENSHOT_DIR).filter(f => f.startsWith('screenshot-') && f.endsWith('.png'));
const nums = existing.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] || '0', 10));
const next = (nums.length ? Math.max(...nums) : 0) + 1;
const filename = label ? `screenshot-${next}-${label}.png` : `screenshot-${next}.png`;
const outPath = path.join(SCREENSHOT_DIR, filename);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle2' });

// Scroll through page to trigger IntersectionObserver animations, then back to top
await page.evaluate(async () => {
  await new Promise(resolve => {
    const totalHeight = document.body.scrollHeight;
    const step = 600;
    let scrollPos = 0;
    const interval = setInterval(() => {
      scrollPos += step;
      window.scrollTo(0, scrollPos);
      if (scrollPos >= totalHeight) {
        window.scrollTo(0, 0);
        clearInterval(interval);
        resolve();
      }
    }, 120);
  });
});

await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Screenshot saved: ${outPath}`);
