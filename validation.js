"use strict";

// Papa Parse supplies strings. Trim for checking without changing the source row.
function cleanValue(value) {
  return String(value ?? "").trim();
}

function normalizeSku(value) {
  return cleanValue(value).toLowerCase();
}

function isValidPrice(value) {
  return /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

function isValidStock(value) {
  return /^\d+$/.test(value);
}

function isHttpUrl(value) {
  // Require the absolute URL form, rather than letting URL repair a missing //.
  if (!/^https?:\/\//i.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

function countSkus(products) {
  const counts = new Map();
  for (const product of products) {
    const sku = normalizeSku(product.sku);
    if (sku !== "") {
      counts.set(sku, (counts.get(sku) || 0) + 1);
    }
  }
  return counts;
}

function validateProduct(product, productRow, skuCounts) {
  const issues = [];
  const sku = cleanValue(product.sku);

  function addIssue(field, severity, message) {
    issues.push({ productRow, sku, field, severity, message });
  }

  for (const field of ["sku", "name", "category", "price", "stock"]) {
    if (cleanValue(product[field]) === "") {
      addIssue(field, "error", `${field} is required.`);
    }
  }

  if (sku !== "" && skuCounts.get(normalizeSku(sku)) > 1) {
    addIssue("sku", "error", "SKU must be unique (ignoring capitalization and surrounding spaces).");
  }

  const price = cleanValue(product.price);
  // A missing number already has a required-field issue; do not report it twice.
  if (price !== "" && !isValidPrice(price)) {
    addIssue("price", "error", "Price must be greater than zero, using digits and an optional decimal dot with one or two decimal places (for example, 12.50).");
  }

  const stock = cleanValue(product.stock);
  if (stock !== "" && !isValidStock(stock)) {
    addIssue("stock", "error", "Stock must be a whole number written with digits only; zero is allowed.");
  }

  if (cleanValue(product.description) === "") {
    addIssue("description", "warning", "Description is missing.");
  }

  const imageUrl = cleanValue(product.image_url);
  if (imageUrl === "") {
    addIssue("image_url", "warning", "Image URL is missing.");
  } else if (!isHttpUrl(imageUrl)) {
    addIssue("image_url", "warning", "Image URL must be an absolute HTTP or HTTPS URL (for example, https://example.com/image.jpg).");
  }

  return issues;
}

// Input: nonblank row objects from a successful import. Output: issue objects only.
// productRow is 1-based within that array, not a physical line number in the file.
function validateProducts(products) {
  const skuCounts = countSkus(products);
  const issues = [];
  for (let index = 0; index < products.length; index += 1) {
    const productIssues = validateProduct(products[index], index + 1, skuCounts);
    issues.push(...productIssues);
  }
  return issues;
}

// Node's test runner uses these exports; browsers use the function declarations.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { validateProducts, validateProduct, countSkus, cleanValue,
    normalizeSku, isValidPrice, isValidStock, isHttpUrl };
}
