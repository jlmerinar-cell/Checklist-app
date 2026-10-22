/**
 * Rasterize public/icons/check.svg into favicon, PWA, and Android source PNGs.
 * Run: node scripts/render-brand-icons.mjs
 * Android launcher mipmaps are not committed. From a machine with the Android
 * project: npx @capacitor/assets generate --android --assetPath resources
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const jobs = [
  ["public/icons/check.svg", 180, "public/__grok/icon-180.png"],
  ["public/icons/check.svg", 192, "public/icons/icon-192.png"],
  ["public/icons/check.svg", 512, "public/icons/icon-512.png"],
  ["public/icons/check.svg", 1024, "resources/icon.png"],
  ["public/icons/check-maskable.svg", 192, "public/icons/icon-maskable-192.png"],
  ["public/icons/check-maskable.svg", 512, "public/icons/icon-maskable-512.png"],
  ["public/icons/check-foreground.svg", 1024, "resources/icon-foreground.png"],
  ["public/icons/check-background.svg", 1024, "resources/icon-background.png"],
];

const browser = await chromium.launch();
for (const [svgPath, size, outPath] of jobs) {
  const svg = readFileSync(join(root, svgPath), "utf8").replace("<svg ", `<svg width="${size}" height="${size}" `);
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${svg}</body>`);
  const file = join(root, outPath);
  mkdirSync(dirname(file), { recursive: true });
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  await page.close();
  console.log(outPath);
}
await browser.close();
