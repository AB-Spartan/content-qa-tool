# Technical guide

Implementation notes for learning and maintaining the project. For setup and
testing commands, see the [README](../README.md).

## CSV format

The required first nonblank row is exactly:

```csv
sku,name,category,price,stock,description,image_url
```

Header spelling, order, capitalization and spacing must match. Commas are the
separator. UTF-8 BOM and CRLF line endings are accepted. Empty rows, including
rows with whitespace-only fields, are skipped. Any nonblank product row counts
in Total products, even when its values fail validation.

## From file to validation results to the DOM

The **DOM** is the browser's representation of the HTML page. JavaScript can
find its elements, change their text, and attach new elements.

1. The file input's `change` event calls `resetResults()`. This replaces the three
   counts with `—`, restores the accessible “not checked” labels, and replaces
   previous rows with the pre-import empty state. The **Import CSV** button is
   enabled when a file is selected.
2. The button's `click` event calls the shared `importCatalog(source, isDemo)`
   function. This clears results again, checks the selected file,
   disables the controls temporarily, and asks `Papa.parse(file, options)` to
   read it. File reading takes time; Papa calls `complete(results)` when ready.
3. Papa handles CSV syntax, including quotes and embedded commas. With
   `header: true`, `results.data` is an **array** (an ordered list) of product
   **objects** with named properties such as `sku` and `price`. Values stay as
   strings so formats such as `2.0` remain available for validation.
4. After the existing header and parser checks pass,
   `validateProducts(products)` returns an array of issue objects. Parsing and
   validation remain separate: `"12,50"` is valid quoted CSV, but fails our
   price rule. The engine itself does not touch the DOM or change product data.
5. `issues.filter(issue => issue.severity === "error")` selects errors;
   another `filter` selects warnings. Each resulting array's `.length` supplies
   the corresponding summary count. These are issue counts, so a product with
   four errors contributes four to Errors.
6. `renderIssues(issues)` clears the table body with `replaceChildren()` and
   loops over the returned issues. For each issue, `createElement("tr")` creates
   a row. A second loop creates five `td` cells in the order Product row, SKU,
   Field, Severity, Issue. `textContent` supplies each cell's text; `append`
   attaches cells to the row and the row to the existing table body. The severity
   cell contains a styled span with the same text; color supports that label.
7. An empty issues array displays **No issues found** in one cell spanning all
   five columns. This differs from the pre-import state: the catalog has now
   been checked. A blank SKU stays blank in its cell; its explanation states
   that the SKU is required.
8. The count elements receive their new text, and the existing polite live
   status announces the product, error and warning counts. Hidden “not checked”
   labels are cleared. Focus is not moved away from the user's controls.

For example, an issue returned by the engine is:

```js
{
  productRow: 5,
  sku: "sku-004",
  field: "sku",
  severity: "error",
  message: "SKU must be unique (ignoring capitalization and surrounding spaces)."
}
```

The table displays those five property values in one row. `productRow` is
one-based within the imported nonblank products; it excludes the header and is
not a physical CSV line number. The table heading is **Product row**.

`showEmptyResults(title, explanation)` also uses created elements and
`textContent`. Imported strings are never inserted using `innerHTML` or HTML
strings. A SKU containing markup remains text. The existing table semantics,
keyboard focus, responsive cards, and scrolling container are retained. The table uses
fixed column widths, wrapping for long values, alternating row backgrounds and
text-labelled severity badges. The table alone scrolls on narrow screens.

`showImportError(message)` uses the same reset function. Invalid headers, CSV
parser errors, file-reading failures, missing library errors and unexpected
reader exceptions therefore leave no stale results visible.

Reference: [official Papa Parse documentation](https://www.papaparse.com/docs).

## Validation engine walkthrough

`validateProducts(products)` accepts successfully parsed, nonblank product
objects and returns issues without modifying its input. Its functions are
available in the browser and exported for Node tests.

### Product validation rules

| Field | Check | Severity |
| --- | --- | --- |
| sku | Required; unique after trimming and ignoring capitalization. Flag every duplicate occurrence. | Error |
| name | Required after trimming. | Error |
| category | Required after trimming; any nonempty category is accepted. | Error |
| price | Required; greater than zero; digits with an optional dot and one or two decimal places. | Error |
| stock | Required; digits only, including zero. | Error |
| description | Missing or whitespace-only content. | Warning |
| image_url | Missing content or a value that is not an absolute HTTP/HTTPS URL. | Warning |

Missing price/stock receives one required-field error, rather than an additional
format error. URL checks inspect format only; they do not request images or
check whether a host or image exists. Blank-row filtering and CSV header/structure
checks remain Papa Parse/import responsibilities. Pass the engine successfully
parsed, nonblank rows, keeping values as strings (`dynamicTyping: false`).

### Reading the functions

- A **function** is a named piece of reusable work. Its parameters are inputs;
  `return` gives its result back. `cleanValue` converts a missing value to an
  empty string and trims surrounding whitespace. `normalizeSku` also converts
  it to lowercase for comparisons. Neither changes the original product.
- `isValidPrice`, `isValidStock`, and `isHttpUrl` return **booleans** (`true` or
  `false`). Their input is already trimmed by `validateProduct`. The URL helper
  checks the HTTP/HTTPS prefix, then uses the browser/Node `URL` parser.
  `try/catch` returns false if parsing fails.
- `countSkus` uses a **Map**, a lookup from each normalized SKU to its count.
  The `for...of` loop visits each product. `get` reads the previous count, `|| 0`
  starts a new count at zero, and `set` stores the incremented value. Blank SKUs
  are skipped. Counting first ensures even the first occurrence of a duplicate
  receives an issue. A Map also safely handles SKUs such as `constructor`.
- `validateProduct` checks one product. The required-field loop repeats the same
  check for five fields; `product[field]` reads the property named by the loop
  variable. **Conditionals** (`if`, `else if`) decide which issues apply. `&&`
  means both conditions must be true; `!` means “not.” Checking a number only
  when it is nonempty avoids double-reporting a missing value.
- Its small nested `addIssue` function creates a consistent **object** with five
  named properties and appends it to the issues **array** using `push`. It reuses
  the row and SKU from the containing function.
- `validateProducts` coordinates two passes: count SKUs, then check each product.
  Its indexed `for` loop starts at zero, continues while the index is below the
  array's length, and adds one each time. `index + 1` gives the human-facing
  product row. `issues.push(...productIssues)` appends each returned issue into
  one flat list; `...` spreads the array's items.

### Reading the regular expressions

A regular expression is a pattern for text. `.test(value)` returns whether the
text matches. In both numeric patterns, `^` means start of text and `$` means
end, so extra characters are rejected. `\d` means an ASCII digit (0–9); `+`
means one or more repetitions.

- Price: `/^\d+(\.\d{1,2})?$/`. The parentheses group the decimal part; `\.`
  matches a literal dot; `{1,2}` allows one or two digits after it; `?` makes
  the whole group optional. `Number(value) > 0` additionally rejects zero.
  Examples: `12`, `12.5`, `12.50` pass; `0`, `-1`, `1e2`, `12,50`, `$12`,
  `1,000`, `.5`, and `12.345` fail.
- Stock: `/^\d+$/`. Only digits are allowed: `0` and `25` pass, while `-1`,
  `2.5`, and `2.0` fail. Leading zeros are allowed by the agreed digit-only rule.
- URL prefix: `/^https?:\/\//i`. The `s?` permits `http` or `https`, `\/`
  matches a slash, and `i` makes the prefix case-insensitive. This prefix check
  works together with `new URL`, rather than attempting a full URL regex.

## CSV report export

**Download QA Report** starts disabled. A successful import with at least one
error or warning enables it. A clean or header-only catalog keeps it disabled.
The button uses the existing button styles and wrapping controls.

The downloaded file is named `content-qa-report.csv`. It contains only the
detected issues, with this exact column order:

```csv
product_row,sku,field,severity,message
```

The sample exports **19 records plus one header record**: 15 errors and 4
warnings. Report rows describe issues rather than products, so a product with
several issues appears several times. CSV records can contain embedded line
breaks; count parsed records rather than splitting a file on newline characters.

### How export works

1. `reportIssues` is an array held in memory. Successful validation assigns its
   issue array to this variable. `resetResults()` replaces it with `[]` and
   disables the report button whenever a file selection changes, an import
   begins, or an import fails. The click handler also checks for an empty array,
   preventing an old report from being exported even if called directly.
2. `createReportCsv(issues)` uses `map` to turn each issue into an ordered array:
   `[productRow, sku, field, severity, message]`. An explicit `fields` array
   supplies the report header, including the change from the JavaScript property
   `productRow` to the CSV heading `product_row`.
3. `Papa.unparse({ fields, data }, options)` converts those arrays into CSV text.
   It quotes fields containing commas, quotes or line breaks and doubles embedded
   quotation marks. We do not build CSV with `join(",")`, which would lose the
   boundaries between those values. No complete product rows are exported.
4. The `escapeFormulae` option is enabled with `/^[=+\-@\t\r]/`. It checks for
   a leading `=`, `+`, `-`, `@`, tab or carriage return, and Papa prepends an
   apostrophe to matching strings. This keeps them as text for spreadsheet use.
   Escaping applies to the exported copy; displayed issues and imported products
   are unchanged. For example, a SKU of `=1+1` exports as `'=1+1`.
5. A browser-native `Blob` holds the CSV text with the MIME type
   `text/csv;charset=utf-8`. `URL.createObjectURL(blob)` creates a temporary
   browser-local address for those bytes. This does not upload the report.
6. A temporary hidden link receives that address in `href` and the filename in
   its `download` property. The code appends it, calls `click()` to request the
   download, then removes the link. A one-second timer calls
   `URL.revokeObjectURL(url)` to release the temporary address after the browser
   has time to begin downloading. Each download creates a fresh Blob and URL.
7. If report creation or the download request throws an error, the existing
   status paragraph explains how to retry. The validated issues stay available.

The custom formula pattern is deliberate: the default pattern in our pinned
Papa Parse 5.5.3 misses strings that contain embedded newlines. A prefix-only
pattern protects those strings too. Its `^` checks the start, brackets list
allowed matches, `\-` is a literal minus sign, and `\t`/`\r` mean tab/carriage
return. Papa supports a regular expression for `escapeFormulae`; see the
[official unparse options](https://www.papaparse.com/docs#unparse-config-options).

### Try the export

1. Open the page and confirm **Download QA Report** is disabled.
2. Import the sample, confirm 12/15/4 in the summary, then download the report.
   Open it as CSV: expect the five agreed headers and 19 issue records.
3. Select a different file: the button disables immediately. Import a clean
   catalog or an invalid CSV: it stays disabled. Reimport the sample to enable it.
4. In a copy, use a SKU containing commas, quotes and an embedded newline, then
   set its price to `bad` so it generates an issue. Export it and parse the CSV:
   the entire SKU should remain in one field of one record.
5. Repeat with a SKU such as `=SUM(1,2)`. The report's parsed SKU should start
   with an apostrophe, while the results table still shows the original SKU.
   The automated tests also exercise multiline formula-like strings and all six
   protected leading characters.

The sample report contains **19 records, 15 errors and 4 warnings**, with the
header shown above.


## Demo and manual import

Both inputs call `importCatalog(source, isDemo)`. A manual import supplies a
browser File object. Load Demo supplies `sample-products.csv` and enables
Papa Parse’s `download: true` option. The resulting data uses the same header
checks, validation functions, rendering, summary counts and export preparation.

Loading the demo clears any selected filename so an earlier file cannot be
mistaken for the demo. Both routes clear previous results and export data before
reading. Controls are disabled during loading and restored after success or
failure. The live status region announces progress and outcomes.

## Interface and accessibility

The page uses named sections, a labelled file input, a summary description list
and a semantic table with a caption and scoped headers. Error and warning
badges retain text labels alongside their color. Long values wrap inside fixed
table columns. On narrow screens the table scrolls inside a labelled keyboard
focus region, with visible scrolling instructions and an inward focus outline.
Status messages wrap long headers to avoid page-level overflow.

## Test approach

The validation tests use the actual CSV and Papa Parse library. Interface tests
execute the scripts with a controlled file reader and a small DOM stand-in that
records created nodes and rejects HTML insertion. Download tests inspect Blob
contents and URL cleanup. The stand-in does not test browser layout or native
file/download dialogs; browser QA evidence and limitations are in the
[QA report](../QA-REPORT.md).
