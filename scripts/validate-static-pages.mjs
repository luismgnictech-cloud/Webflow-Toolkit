import fs from "node:fs";

const pages = {
  "index.html": [],
  "seo-alt-text.html": ["Generate SEO Text", "</html>"],
  "image-compressor.html": ["id=\"files\"", "image-compressor.js", "</html>"],
  "code-playground.html": ["code-playground.js", "</html>"],
  "responsive-lab.html": ["id=\"device-picker\"", "</html>"]
};

let failed = false;
for (const [file, markers] of Object.entries(pages)) {
  if (!fs.existsSync(file)) {
    console.error("Missing:", file);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) {
      console.error(`Invalid or truncated ${file}: missing ${marker}`);
      failed = true;
    }
  }
}
for (const file of ["image-compressor.js", "code-playground.js", "responsive-lab/app.js", "responsive-lab/views.js"]) {
  if (!fs.existsSync(file) || fs.statSync(file).size < 100) {
    console.error("Missing or suspiciously small JS:", file);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("Static page integrity check passed.");
