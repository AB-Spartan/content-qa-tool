"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Papa = require("papaparse");
const { validateProducts } = require("./validation.js");

const header = "sku,name,category,price,stock,description,image_url";
const sampleCsv = fs.readFileSync(path.join(__dirname, "sample-products.csv"), "utf8");

function parseCsv(csv) {
  const results = Papa.parse(csv, {
    header: true, delimiter: ",", dynamicTyping: false, skipEmptyLines: "greedy",
  });
  assert.deepEqual(results.errors, []);
  return results.data;
}

function validProduct(changes = {}) {
  return { sku: "SKU-001", name: "Notebook", category: "Any category",
    price: "12.50", stock: "0", description: "Plain paper",
    image_url: "https://example.com/image.jpg", ...changes };
}

test("actual sample: 12 products, 15 errors, 4 warnings, 8 products with errors", () => {
  const products = parseCsv(sampleCsv);
  const issues = validateProducts(products);
  const errors = issues.filter(issue => issue.severity === "error");
  const warnings = issues.filter(issue => issue.severity === "warning");
  assert.equal(products.length, 12);
  assert.equal(errors.length, 15);
  assert.equal(warnings.length, 4);
  assert.equal(new Set(errors.map(issue => issue.productRow)).size, 8);
  assert.deepEqual([...new Set(errors.map(issue => issue.productRow))], [4, 5, 6, 7, 8, 9, 10, 12]);

  // Check which fields are reported per product, beyond the aggregate totals.
  const expectedFields = [[], [], ["description", "image_url"], ["sku"], ["sku"],
    ["sku"], ["name", "category", "price", "stock"], ["price", "stock"],
    ["price", "stock"], ["price", "stock"], ["description", "image_url"], ["price", "stock"]];
  for (let index = 0; index < products.length; index += 1) {
    assert.deepEqual(issues.filter(issue => issue.productRow === index + 1).map(issue => issue.field), expectedFields[index]);
  }
  assert.deepEqual(issues.find(issue => issue.productRow === 5), {
    productRow: 5, sku: "sku-004", field: "sku", severity: "error",
    message: "SKU must be unique (ignoring capitalization and surrounding spaces).",
  });
  for (const issue of issues) {
    assert.deepEqual(Object.keys(issue), ["productRow", "sku", "field", "severity", "message"]);
    assert.ok(issue.message.length > 0);
  }
});

test("valid data is trimmed for checks; source objects are not changed", () => {
  const product = Object.freeze(validProduct({sku: " AbC ", name: " Notebook ",
    category: " Unlisted category ", price: " 12.50 ", stock: " 0 ",
    description: " Text ", image_url: " https://example.com/image.jpg "}));
  const products = Object.freeze([product]);
  assert.deepEqual(validateProducts(products), []);
  assert.equal(product.sku, " AbC ");
  assert.deepEqual(validateProducts([]), []);
});

test("duplicates flag every occurrence, including case and spaces; blank SKUs only get required errors", () => {
  const products = [validProduct({sku: " AbC "}), validProduct({sku: "abc"}),
    validProduct({sku: "ABC"}), validProduct({sku: " "}), validProduct({sku: ""})];
  const issues = validateProducts(products);
  assert.equal(issues.length, 5);
  assert.deepEqual(issues.slice(0, 3).map(issue => issue.productRow), [1, 2, 3]);
  assert.ok(issues.slice(0, 3).every(issue => /unique/.test(issue.message)));
  assert.ok(issues.slice(3).every(issue => issue.message === "sku is required."));
  assert.equal(issues[0].sku, "AbC");
});

test("missing required fields each receive one error, including missing price and stock", () => {
  for (const missing of ["", " \t ", undefined, null]) {
    const issues = validateProducts([validProduct({sku: missing, name: missing,
      category: missing, price: missing, stock: missing})]);
    assert.equal(issues.length, 5);
    assert.ok(issues.every(issue => issue.severity === "error" && /required/.test(issue.message)));
  }
});

test("prices accept positive dot decimals with at most two places", () => {
  for (const price of ["12", "12.5", "12.50", "0.01", "0012.50", " 12.50 "]) {
    assert.deepEqual(validateProducts([validProduct({price})]), [], price);
  }
  for (const price of ["0", "0.00", "-1", "+1", ".5", "1.", "1.234", "$12", "€12", "1,000", "12,50", "1e2", "Infinity", "NaN", "free", "1 2"]) {
    const issues = validateProducts([validProduct({price})]);
    assert.equal(issues.length, 1, price);
    assert.equal(issues[0].field, "price");
    assert.equal(issues[0].severity, "error");
  }
});

test("stock accepts only digits, including zero", () => {
  for (const stock of ["0", "12", "001", " 2 "]) {
    assert.deepEqual(validateProducts([validProduct({stock})]), [], stock);
  }
  for (const stock of ["-1", "+2", "2.5", "2.0", "1e2", "1,000", "many", "1 2"]) {
    const issues = validateProducts([validProduct({stock})]);
    assert.equal(issues.length, 1, stock);
    assert.equal(issues[0].field, "stock");
    assert.equal(issues[0].severity, "error");
  }
});

test("optional content produces warnings; HTTP/HTTPS URL format is checked without requests", () => {
  for (const image_url of ["http://example.com/a", "https://example.com/a?x=1", " HTTPS://example.com/a "]) {
    assert.deepEqual(validateProducts([validProduct({image_url})]), []);
  }
  for (const image_url of ["", " \t ", undefined, "www.example.com/a", "/image.jpg", "ftp://example.com/a", "https://", "https:example.com/a", "https://bad host/a"]) {
    const issues = validateProducts([validProduct({description: "  ", image_url})]);
    assert.deepEqual(issues.map(issue => issue.field), ["description", "image_url"]);
    assert.ok(issues.every(issue => issue.severity === "warning"));
    assert.equal(issues.some(issue => issue.severity === "error"), false);
  }
});

test("Papa skips blank rows and preserves quoted commas before validation", () => {
  const products = parseCsv(header + '\n\n , , , , , , \nA,"Notebook, A5",Office,"12,50",2.0,,\n');
  assert.equal(products.length, 1);
  assert.equal(products[0].name, "Notebook, A5");
  assert.equal(products[0].price, "12,50");
  const issues = validateProducts(products);
  assert.deepEqual(issues.map(issue => issue.field), ["price", "stock", "description", "image_url"]);
  assert.ok(issues.every(issue => issue.productRow === 1));
});

