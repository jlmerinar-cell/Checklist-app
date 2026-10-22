import { readFileSync, writeFileSync } from "node:fs";

const path = "android/app/build.gradle";
const text = readFileSync(path, "utf8");
if (!/versionCode\s+\d+/.test(text) || !/versionName\s+"[^"]*"/.test(text)) {
  console.error("android/app/build.gradle is missing versionCode or versionName");
  process.exit(1);
}
const next = text
  .replace(/versionCode\s+\d+/, "versionCode 7")
  .replace(/versionName\s+"[^"]*"/, 'versionName "1.4.2"');
writeFileSync(path, next);
console.log('Set Android versionName 1.4.2, versionCode 7');
