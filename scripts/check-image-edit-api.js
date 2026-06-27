const fs = require("node:fs");
const path = require("node:path");

const requiredFiles = [
  "image-editor.html",
  "image-editor.css",
  "image-editor.js",
  "api/image-edit.js",
  "package.json",
  "vercel.json",
  ".env.example"
];

let failed = false;

for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, "..", file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required file: ${file}`);
    failed = true;
  }
}

const apiSource = fs.readFileSync(path.join(__dirname, "..", "api", "image-edit.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const editorSource = fs.readFileSync(path.join(__dirname, "..", "image-editor.html"), "utf8");
const expectedSnippets = [
  "XIAOJI_API_KEY",
  "LEAD_WEBHOOK_URL",
  "KV_REST_API_URL",
  "https://xiaoji.baziapi.site/v1/images/edits",
  "parseMultipartRequest",
  "file_too_large",
  "usage_limit_reached"
];

for (const snippet of expectedSnippets) {
  if (!apiSource.includes(snippet)) {
    console.error(`API implementation missing snippet: ${snippet}`);
    failed = true;
  }
}

const expectedHomepageLinks = ["./image-editor.html", "免费改一张招生海报", "AI招生图改稿器"];
for (const snippet of expectedHomepageLinks) {
  if (!indexSource.includes(snippet)) {
    console.error(`Homepage missing image editor entry: ${snippet}`);
    failed = true;
  }
}

const expectedEditorFields = ["leadName", "contact", "courseType", "platform", "template", "notes", "image"];
for (const field of expectedEditorFields) {
  if (!editorSource.includes(`name="${field}"`)) {
    console.error(`Image editor form missing field: ${field}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Image edit implementation files look ready.");
