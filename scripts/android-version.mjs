import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const versionName = pkg.version;
const versionCode = pkg.androidVersionCode;
if (typeof versionName !== "string" || !/^\d+\.\d+\.\d+$/.test(versionName)) {
  console.error("package.json version must be MAJOR.MINOR.PATCH");
  process.exit(1);
}
if (!Number.isInteger(versionCode) || versionCode < 1) {
  console.error("package.json androidVersionCode must be a positive integer");
  process.exit(1);
}

const path = "android/app/build.gradle";
const text = readFileSync(path, "utf8");
if (!/versionCode\s+\d+/.test(text) || !/versionName\s+"[^"]*"/.test(text)) {
  console.error("android/app/build.gradle is missing versionCode or versionName");
  process.exit(1);
}
const next = text
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
writeFileSync(path, next);
console.log(`Set Android versionName ${versionName}, versionCode ${versionCode}`);
