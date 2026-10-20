"use strict";

const expectedHeaders = ["sku", "name", "category", "price", "stock", "description", "image_url"];
const fileInput = document.querySelector("#csv-file");
const importButton = document.querySelector("#import-button");
const demoButton = document.querySelector("#demo-button");
const importStatus = document.querySelector("#import-status");
const totalProducts = document.querySelector("#total-products");
const totalStatus = document.querySelector("#total-status");
const errorCount = document.querySelector("#error-count");
const warningCount = document.querySelector("#warning-count");
const errorStatus = document.querySelector("#error-status");
const warningStatus = document.querySelector("#warning-status");
const resultsBody = document.querySelector("#results-body");
const reportButton = document.querySelector("#report-button");
let reportIssues = [];
reportButton.disabled = true;

function createReportCsv(issues) {
  // Explicit fields and row arrays guarantee the report's five-column order.
  return Papa.unparse({
    fields: ["product_row", "sku", "field", "severity", "message"],
    data: issues.map(issue => [issue.productRow, issue.sku, issue.field, issue.severity, issue.message]),
  }, {
    // Check the prefix only: Papa 5.5.3's default pattern misses multiline cells.
    escapeFormulae: /^[=+\-@\t\r]/,
  });
}

reportButton.addEventListener("click", () => {
  if (reportIssues.length === 0 || !window.Papa) {
    return;
  }
  try {
    const csv = createReportCsv(reportIssues);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "content-qa-report.csv";
    link.hidden = true;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      // Give the browser time to start the download before releasing its URL.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    importStatus.textContent = "The report could not be downloaded. Try Download QA Report again.";
  }
});

function showEmptyResults(title, explanation) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 5;
  cell.className = "empty-state";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("span");
  detail.textContent = explanation;
  cell.append(heading, detail);
  row.append(cell);
  resultsBody.replaceChildren(row);
}

function resetResults() {
  reportIssues = [];
  reportButton.disabled = true;
  totalProducts.textContent = "—";
  totalStatus.textContent = "Not imported yet";
  errorCount.textContent = "—";
  warningCount.textContent = "—";
  errorStatus.textContent = "Not checked yet";
  warningStatus.textContent = "Not checked yet";
  showEmptyResults("No validation results yet", "Import a CSV to check its products and see issues here.");
}

function renderIssues(issues) {
  resultsBody.replaceChildren();
  if (issues.length === 0) {
    showEmptyResults("No issues found", "The imported catalog passed all current validation checks.");
    return;
  }

  for (const issue of issues) {
    const row = document.createElement("tr");
    const values = [issue.productRow, issue.sku, issue.field, issue.severity, issue.message];
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const cell = document.createElement("td");
      // Imported text is displayed literally, never interpreted as HTML.
      if (index === 3) {
        const badge = document.createElement("span");
        badge.className = `severity-badge severity-${issue.severity}`;
        badge.textContent = String(value);
        cell.append(badge);
      } else {
        cell.textContent = String(value);
      }
      row.append(cell);
    }
    resultsBody.append(row);
  }
}

function showImportError(message) {
  resetResults();
  importStatus.textContent = message;
}

// Selecting a different file clears all previous counts and validation rows.
fileInput.addEventListener("change", () => {
  resetResults();
  importButton.disabled = !fileInput.files.length;
  importStatus.textContent = fileInput.files.length
    ? "File selected. Select Import CSV to read it."
    : "Choose a CSV file to begin.";
});

// Local files and the demo share every parsing, validation and display step.
function importCatalog(source, isDemo = false) {
  resetResults();

  if (!isDemo && !source) {
    showImportError("Choose a CSV file before importing.");
    return;
  }
  if (!isDemo && !source.name.toLowerCase().endsWith(".csv")) {
    showImportError("Choose a file with a .csv extension.");
    return;
  }
  if (!window.Papa) {
    showImportError("The CSV reader could not load. Check your internet connection and reload this page.");
    return;
  }

  importButton.disabled = true;
  demoButton.disabled = true;
  fileInput.disabled = true;
  importStatus.textContent = isDemo ? "Loading demo CSV…" : "Reading CSV…";

  function finishImport() {
    fileInput.disabled = false;
    importButton.disabled = fileInput.files.length === 0;
    demoButton.disabled = false;
  }

  try {
    Papa.parse(source, {
      download: isDemo,
      delimiter: ",",
      header: true,
      dynamicTyping: false,
      encoding: "UTF-8",
      skipEmptyLines: "greedy",
      complete(results) {
        finishImport();
        const headers = results.meta.fields || [];
        const hasExpectedHeaders = headers.length === expectedHeaders.length
          && expectedHeaders.every((header, index) => headers[index] === header);

        if (!hasExpectedHeaders) {
          showImportError(`The first nonblank row must be exactly: ${expectedHeaders.join(",")}. Check the spelling and column order.`);
          return;
        }
        if (results.errors.length) {
          showImportError("The CSV could not be imported. Check for unclosed quotes and rows with more or fewer than seven fields, then try again.");
          return;
        }

        // Papa has already skipped rows whose fields are all empty or whitespace.
        const products = results.data;
        const issues = validateProducts(products);
        const errors = issues.filter(issue => issue.severity === "error");
        const warnings = issues.filter(issue => issue.severity === "warning");
        renderIssues(issues);
        totalProducts.textContent = String(products.length);
        totalStatus.textContent = "";
        errorCount.textContent = String(errors.length);
        warningCount.textContent = String(warnings.length);
        errorStatus.textContent = "";
        warningStatus.textContent = "";
        reportIssues = issues;
        reportButton.disabled = issues.length === 0;
        importStatus.textContent = `${isDemo ? "Demo loaded and checked" : "Imported and checked"} ${products.length} product ${products.length === 1 ? "row" : "rows"}. Errors: ${errors.length}. Warnings: ${warnings.length}.`;
      },
      error() {
        finishImport();
        showImportError(isDemo
          ? "The demo could not be loaded. Check your connection and try Load Demo again."
          : "The file could not be read. Select the CSV file again and retry.");
      },
    });
  } catch {
    finishImport();
    showImportError("The CSV reader could not read this file. Select the CSV file again and retry.");
  }
}

importButton.addEventListener("click", () => {
  importCatalog(fileInput.files[0]);
});

demoButton.addEventListener("click", () => {
  // Clear a previous manual selection so it cannot be mistaken for the demo.
  fileInput.value = "";
  importCatalog("sample-products.csv", true);
});

if (!window.Papa) {
  importStatus.textContent = "The CSV reader could not load. Check your internet connection and reload this page.";
}
