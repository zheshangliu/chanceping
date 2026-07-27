import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync("web/business.js", "utf8");
const css = fs.readFileSync("web/business.css", "utf8");
assert.match(js, /classList\.toggle\("business-list-view", button\.dataset\.view === "list"\)/);
assert.match(js, /classList\.toggle\("business-card-grid", button\.dataset\.view === "cards"\)/);
assert.match(css, /\.business-card-grid\s*\{/);
assert.match(css, /\.business-card-grid \.business-opportunity-card \{ display: flex !important/);
assert.match(css, /-webkit-line-clamp: 2/);
assert.match(css, /-webkit-line-clamp: 3/);
console.log("Business view toggle contract passed: cards/list classes are both switched");
