"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Papa = require("papaparse");

const sampleCsv = fs.readFileSync(path.join(__dirname, "sample-products.csv"), "utf8");
const header = "sku,name,category,price,stock,description,image_url";
const cleanCsv = header + "\nOK,Notebook,Office,12.50,0,Plain paper,https://example.com/image.jpg";

// A small DOM stand-in keeps the tests dependency-free apart from Papa Parse.
// It records created nodes and rejects HTML insertion. Real-browser checks
// complement these tests; this is not a browser layout or HTML parser.
class TestElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.value = "";
    this.disabled = false;
    this.files = [];
    this.handlers = {};
  }
  set value(value) {
    this.storedValue = value;
    if (this.tagName === "INPUT" && value === "") this.files = [];
  }
  get value() { return this.storedValue; }
  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }
  get textContent() {
    return this.value + this.children.map(child => child.textContent).join("");
  }
  set innerHTML(value) {
    throw new Error("Use textContent instead of innerHTML");
  }
  insertAdjacentHTML() {
    throw new Error("Use createElement instead of insertAdjacentHTML");
  }
  append(...children) {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }
  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
    }
  }
  replaceChildren(...children) {
    this.value = "";
    this.children = children;
  }
  addEventListener(event, handler) {
    this.handlers[event] = handler;
  }
}

function setup() {
  const elements = {};
  for (const id of ["csv-file", "import-button", "import-status", "total-products",
    "total-status", "error-count", "warning-count", "error-status", "warning-status", "results-body", "report-button", "demo-button"]) {
    elements[id] = new TestElement(id === "results-body" ? "tbody" : id === "csv-file" ? "input" : "span");
  }
  let pending;
  const downloads = [];
  const blobs = [];
  const revoked = [];
  const timers = [];
  const parseCalls = [];
  const body = new TestElement("body");
  class TestURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return `blob:test-${blobs.length}`; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  const reader = { parse(file, options) {
    pending = { file, options };
    parseCalls.push(pending);
  }, unparse: Papa.unparse };
  const context = vm.createContext({ URL: TestURL, Blob, Papa: reader, window: { Papa: reader },
    setTimeout(callback, delay) { timers.push({ callback, delay }); },
    document: {
      body,
      querySelector(selector) { return elements[selector.slice(1)]; },
      createElement(tagName) {
        const element = new TestElement(tagName);
        if (tagName === "a") element.click = () => {
          downloads.push({ href: element.href, filename: element.download,
            attached: body.children.includes(element), hidden: element.hidden });
        };
        return element;
      },
    } });
  // Load unparse in the script's realm so its instanceof RegExp check works
  // exactly as it does in the browser with our custom formula-escaping pattern.
  vm.runInContext(fs.readFileSync(require.resolve("papaparse"), "utf8"), context);
  reader.unparse = context.Papa.unparse;
  context.Papa = reader;
  for (const script of ["validation.js", "app.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, script), "utf8"), context);
  }
  return {
    elements, context, downloads, blobs, revoked, timers, body, parseCalls,
    demo() { elements["demo-button"].handlers.click(); },
    download() { elements["report-button"].handlers.click(); },
    select(content, name = "test.csv") {
      elements["csv-file"].files = content === null ? [] : [{ name, content }];
      elements["csv-file"].handlers.change();
    },
    start() { elements["import-button"].handlers.click(); },
    finish(demoCsv = sampleCsv) {
      // Simulate the network response for a demo URL, or FileReader for a file.
      const { complete, error, download, ...options } = pending.options;
      complete(Papa.parse(download ? demoCsv : pending.file.content, options));
    },
    failRead() { pending.options.error(new Error("simulated FileReader failure")); },
  };
}

function importCsv(app, csv, name) {
  app.select(csv, name);
  app.start();
  app.finish();
}

function assertCleared(app) {
  assert.equal(app.elements["report-button"].disabled, true);
  const previousDownloads = app.downloads.length;
  app.download(); // Even a direct event call cannot export stale data.
  assert.equal(app.downloads.length, previousDownloads);
  for (const id of ["total-products", "error-count", "warning-count"]) {
    assert.equal(app.elements[id].textContent, "—", id);
  }
  assert.equal(app.elements["error-status"].textContent, "Not checked yet");
  assert.equal(app.elements["warning-status"].textContent, "Not checked yet");
  const rows = app.elements["results-body"].children;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children[0].colSpan, 5);
  assert.match(rows[0].textContent, /No validation results yet/);
}

test("sample UI displays 12 products, 15 errors, 4 warnings and 19 issue rows", () => {
  const app = setup();
  importCsv(app, sampleCsv);
  assert.equal(app.elements["total-products"].textContent, "12");
  assert.equal(app.elements["error-count"].textContent, "15");
  assert.equal(app.elements["warning-count"].textContent, "4");
  assert.equal(app.elements["error-status"].textContent, "");
  assert.equal(app.elements["warning-status"].textContent, "");
  const rows = app.elements["results-body"].children;
  assert.equal(rows.length, 19);
  assert.ok(rows.every(row => row.tagName === "TR" && row.children.length === 5));
  const cells = rows[0].children;
  assert.deepEqual(cells.map(cell => cell.textContent), ["3", "SKU-003", "description", "warning", "Description is missing."]);
  assert.ok(cells.every(cell => cell.tagName === "TD"));
  assert.match(app.elements["import-status"].textContent, /Errors: 15. Warnings: 4/);
});

test("selection changes, cleared selection and a new import clear previous results", () => {
  const app = setup();
  importCsv(app, sampleCsv);
  app.select(cleanCsv);
  assertCleared(app);
  assert.equal(app.elements["import-button"].disabled, false);
  app.start();
  assertCleared(app);
  assert.equal(app.elements["csv-file"].disabled, true);
  assert.equal(app.elements["import-button"].disabled, true);
  app.finish();
  // Import again without changing the selected file: start must also clear it.
  app.start();
  assertCleared(app);
  app.finish();
  app.select(null);
  assertCleared(app);
  assert.equal(app.elements["import-button"].disabled, true);
});

test("clean and header-only catalogs show zero counts and the no-issues empty state", () => {
  const app = setup();
  for (const csv of [cleanCsv, header]) {
    importCsv(app, sampleCsv);
    importCsv(app, csv);
    assert.equal(app.elements["total-products"].textContent, csv === header ? "0" : "1");
    assert.equal(app.elements["error-count"].textContent, "0");
    assert.equal(app.elements["warning-count"].textContent, "0");
    const rows = app.elements["results-body"].children;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].children[0].colSpan, 5);
    assert.match(rows[0].textContent, /No issues found/);
    importCsv(app, sampleCsv);
    assert.equal(app.elements["results-body"].children.length, 19);
  }
});

test("warning-only catalogs show zero errors and keep their warning issue rows", () => {
  const app = setup();
  importCsv(app, header + "\nA,Notebook,Office,12.50,0,,");
  assert.equal(app.elements["error-count"].textContent, "0");
  assert.equal(app.elements["warning-count"].textContent, "2");
  assert.equal(app.elements["results-body"].children.length, 2);
});

test("parser and file-reading failures leave no stale counts or issue rows", () => {
  const app = setup();
  for (const csv of ["name,sku\nA,B", "", header + '\nA,"unclosed', header + "\nA,B"]) {
    importCsv(app, sampleCsv);
    importCsv(app, csv);
    assertCleared(app);
    assert.equal(app.elements["csv-file"].disabled, false);
    assert.equal(app.elements["import-button"].disabled, false);
  }
  importCsv(app, sampleCsv);
  app.start();
  app.failRead();
  assertCleared(app);
  assert.match(app.elements["import-status"].textContent, /file could not be read/);
  assert.equal(app.elements["csv-file"].disabled, false);
  assert.equal(app.elements["import-button"].disabled, false);
});

test("missing file, wrong extension, missing library and reader exceptions clear results", () => {
  for (const failure of ["no-file", "extension", "library", "exception"]) {
    const app = setup();
    importCsv(app, sampleCsv);
    if (failure === "no-file") app.select(null);
    if (failure === "extension") app.select(sampleCsv, "catalog.txt");
    if (failure === "library") app.context.window.Papa = undefined;
    if (failure === "exception") app.context.Papa.parse = () => { throw new Error("read failed"); };
    app.start();
    assertCleared(app);
    assert.doesNotMatch(app.elements["import-status"].textContent, /Imported and checked/);
    assert.equal(app.elements["csv-file"].disabled, false);
  }
});

test("reimport replaces rows rather than duplicating them", () => {
  const app = setup();
  importCsv(app, sampleCsv);
  app.start();
  app.finish();
  assert.equal(app.elements["results-body"].children.length, 19);
});

test("HTML-like imported SKU is literal text, never an element", () => {
  const app = setup();
  const sku = "<img src=x onerror=alert(1)>";
  const csv = Papa.unparse([
    header.split(","), [sku, "Notebook", "Office", "bad", "0", "Text", "https://example.com/a"],
  ]);
  importCsv(app, csv);
  const row = app.elements["results-body"].children[0];
  assert.equal(row.children[1].textContent, sku);
  assert.deepEqual(row.children[1].children, []);
  assert.equal(row.children[1].tagName, "TD");
});

test("report starts disabled and stays unavailable for clean or header-only catalogs", () => {
  const app = setup();
  assert.equal(app.elements["report-button"].disabled, true);
  app.download();
  assert.equal(app.downloads.length, 0);
  for (const csv of [cleanCsv, header]) {
    importCsv(app, sampleCsv);
    assert.equal(app.elements["report-button"].disabled, false);
    importCsv(app, csv);
    assert.equal(app.elements["report-button"].disabled, true);
    app.download();
    assert.equal(app.downloads.length, 0);
  }
});

test("sample report downloads 19 issue records with the exact ordered header", async () => {
  const app = setup();
  importCsv(app, sampleCsv);
  assert.equal(app.elements["report-button"].disabled, false);
  app.download();
  assert.equal(app.blobs[0].type, "text/csv;charset=utf-8");
  const csv = await app.blobs[0].text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.meta.fields, ["product_row", "sku", "field", "severity", "message"]);
  assert.equal(parsed.data.length, 19);
  assert.equal(Papa.parse(csv).data.length, 20); // Header plus records.
  assert.deepEqual(parsed.data[0], { product_row: "3", sku: "SKU-003",
    field: "description", severity: "warning", message: "Description is missing." });
  assert.equal(parsed.data.filter(issue => issue.severity === "error").length, 15);
  assert.equal(parsed.data.filter(issue => issue.severity === "warning").length, 4);
  assert.deepEqual(app.downloads[0], { href: "blob:test-1", filename: "content-qa-report.csv",
    attached: true, hidden: true });
  assert.equal(app.body.children.length, 0);
  assert.deepEqual(app.revoked, []); // URL stays alive while download starts.
  assert.equal(app.timers[0].delay, 1000);
  app.timers[0].callback();
  assert.deepEqual(app.revoked, ["blob:test-1"]);
  assert.equal(app.elements["report-button"].disabled, false); // Repeat downloads work.
});

test("report preserves commas, quotes, newlines and Unicode without altering issues", () => {
  const app = setup();
  const issue = Object.freeze({ productRow: 1, sku: 'SKU,"A"\nsecond line', field: "price",
    severity: "error", message: 'Price, "quoted"\r\nNext line — café' });
  const csv = app.context.createReportCsv(Object.freeze([issue]));
  const parsed = Papa.parse(csv, { header: true });
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.length, 1);
  assert.equal(parsed.data[0].sku, issue.sku);
  assert.equal(parsed.data[0].message, issue.message);
  assert.match(csv, /""quoted""/);
});

test("report formula escaping protects every text column", () => {
  const app = setup();
  for (const value of ["=1+1", "+SUM(1,2)", "-1+2", "@SUM(A1:A2)", "\t=1+1", "\r=1+1",
    '=SUM(1,2) "quoted"\nnext line', "+1\r\nnext line", "@A1\nnext line"]) {
    const issue = Object.freeze({ productRow: 1, sku: value, field: value,
      severity: value, message: value });
    const csv = app.context.createReportCsv([issue]);
    const record = Papa.parse(csv, { header: true }).data[0];
    for (const field of ["sku", "field", "severity", "message"]) {
      assert.equal(record[field], "'" + value, field);
      assert.equal(issue[field], value); // Escaping affects the report only.
    }
  }
  const safe = { productRow: 1, sku: "SKU-1", field: "price", severity: "error", message: "Use a+b" };
  const record = Papa.parse(app.context.createReportCsv([safe]), { header: true }).data[0];
  assert.equal(record.sku, "SKU-1");
  assert.equal(record.message, "Use a+b");
});

test("download uses the current issues and escapes a formula-like imported SKU", async () => {
  const app = setup();
  importCsv(app, sampleCsv);
  const sku = '=SUM(1,2) "quoted"\nnext line';
  const csv = Papa.unparse([header.split(","),
    [sku, "Notebook", "Office", "bad", "0", "Text", "https://example.com/a"]]);
  importCsv(app, csv);
  app.download();
  const report = Papa.parse(await app.blobs[0].text(), { header: true });
  assert.equal(report.data.length, 1);
  assert.equal(report.data[0].sku, "'" + sku);
  assert.equal(app.elements["results-body"].children[0].children[1].textContent, sku);
});

test("warning-only results can be exported; download failures allow retry", async () => {
  const app = setup();
  importCsv(app, header + "\nA,Notebook,Office,12.50,0,,");
  assert.equal(app.elements["report-button"].disabled, false);
  const unparse = app.context.Papa.unparse;
  app.context.Papa.unparse = () => { throw new Error("simulated export failure"); };
  app.download();
  assert.match(app.elements["import-status"].textContent, /report could not be downloaded/);
  assert.equal(app.elements["report-button"].disabled, false);
  app.context.Papa.unparse = unparse;
  app.download();
  const report = Papa.parse(await app.blobs[0].text(), { header: true });
  assert.equal(report.data.length, 2);
  assert.ok(report.data.every(issue => issue.severity === "warning"));
});

test("one demo click requests the sample and produces the same results and report as manual import", async () => {
  const demoApp = setup();
  demoApp.demo();
  assert.equal(demoApp.parseCalls.length, 1);
  assert.equal(demoApp.parseCalls[0].file, "sample-products.csv");
  assert.equal(demoApp.parseCalls[0].options.download, true);
  demoApp.finish();
  assert.equal(demoApp.elements["total-products"].textContent, "12");
  assert.equal(demoApp.elements["error-count"].textContent, "15");
  assert.equal(demoApp.elements["warning-count"].textContent, "4");
  assert.equal(demoApp.elements["results-body"].children.length, 19);
  assert.match(demoApp.elements["import-status"].textContent, /Demo loaded and checked 12/);
  assert.equal(demoApp.elements["report-button"].disabled, false);
  assert.equal(demoApp.elements["import-button"].disabled, true);
  const manualApp = setup();
  importCsv(manualApp, sampleCsv);
  assert.equal(manualApp.parseCalls[0].options.download, false);
  assert.equal(demoApp.elements["results-body"].textContent, manualApp.elements["results-body"].textContent);
  demoApp.download();
  manualApp.download();
  assert.equal(await demoApp.blobs[0].text(), await manualApp.blobs[0].text());
});

test("demo clears prior results, export data and manual file selection while loading", () => {
  const app = setup();
  importCsv(app, sampleCsv);
  app.demo();
  assertCleared(app);
  assert.equal(app.elements["csv-file"].files.length, 0);
  assert.equal(app.elements["csv-file"].value, "");
  assert.equal(app.elements["demo-button"].disabled, true);
  assert.equal(app.elements["import-button"].disabled, true);
  assert.equal(app.elements["csv-file"].disabled, true);
  assert.match(app.elements["import-status"].textContent, /Loading demo/);
  app.finish();
  assert.equal(app.elements["demo-button"].disabled, false);
  assert.equal(app.elements["csv-file"].disabled, false);
  app.demo();
  app.finish();
  assert.equal(app.elements["results-body"].children.length, 19);
});

test("demo network failure clears export, restores controls and supports retry", () => {
  const app = setup();
  importCsv(app, sampleCsv);
  app.demo();
  app.failRead();
  assertCleared(app);
  assert.match(app.elements["import-status"].textContent, /demo could not be loaded/);
  assert.equal(app.elements["demo-button"].disabled, false);
  assert.equal(app.elements["csv-file"].disabled, false);
  app.demo();
  app.finish();
  assert.equal(app.elements["total-products"].textContent, "12");
});

test("demo uses the same header, parser error and no-issues handling as manual import", () => {
  const app = setup();
  for (const csv of ["name,sku\nA,B", header + '\nA,"unclosed']) {
    app.demo();
    app.finish(csv);
    assertCleared(app);
    assert.equal(app.elements["demo-button"].disabled, false);
  }
  app.demo();
  app.finish(cleanCsv);
  assert.equal(app.elements["error-count"].textContent, "0");
  assert.equal(app.elements["report-button"].disabled, true);
  assert.match(app.elements["results-body"].textContent, /No issues found/);
});

test("manual imports still work after a demo and take ownership of the results", () => {
  const app = setup();
  app.demo();
  app.finish();
  app.select(cleanCsv);
  assertCleared(app);
  app.start();
  app.finish();
  assert.equal(app.elements["total-products"].textContent, "1");
  assert.equal(app.elements["error-count"].textContent, "0");
  assert.equal(app.elements["import-button"].disabled, false);
  assert.match(app.elements["import-status"].textContent, /Imported and checked 1/);
});

test("demo handles a missing CSV library or unexpected reader exception", () => {
  for (const failure of ["library", "exception"]) {
    const app = setup();
    importCsv(app, sampleCsv);
    if (failure === "library") app.context.window.Papa = undefined;
    else app.context.Papa.parse = () => { throw new Error("reader failed"); };
    app.demo();
    assertCleared(app);
    assert.equal(app.elements["demo-button"].disabled, false);
    assert.equal(app.elements["csv-file"].disabled, false);
    assert.match(app.elements["import-status"].textContent, /could not/);
  }
});

test("severity badges keep readable labels and use only the known severity styles", () => {
  const app = setup();
  importCsv(app, sampleCsv);
  const cells = app.elements["results-body"].children.map(row => row.children[3]);
  assert.ok(cells.every(cell => cell.children.length === 1));
  assert.equal(cells.filter(cell => cell.children[0].className === "severity-badge severity-error").length, 15);
  assert.equal(cells.filter(cell => cell.children[0].className === "severity-badge severity-warning").length, 4);
  assert.equal(cells[0].textContent, "warning");
});
