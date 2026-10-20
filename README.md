# Content QA Tool

A browser-based tool for checking product catalog CSV files before publication.
Find missing fields, duplicate SKUs and formatting issues, then download an
issues-only QA report.

## Features

- One-click demo with 12 fictional products and deliberate content issues.
- CSV import with an exact seven-column format and readable import errors.
- Product validation with separate error and warning summaries.
- An accessible, responsive results table showing each affected product and field.
- CSV report export with spreadsheet formula escaping.
- Browser-local file processing: selected catalogs are not uploaded to a server.

## Technologies

HTML, CSS and vanilla JavaScript, with [Papa Parse](https://www.papaparse.com/)
5.5.3 for CSV parsing and generation. Reports use browser-native Blob and
download APIs. Tests use Node.js's built-in test runner. No framework, backend
or build step is required to run the app.

## Demo

A public live demo has not been deployed yet. GitHub Pages is not enabled.

To explore the app locally, serve the project as described below and select
**Load Demo**. Expected results: **12 products, 15 errors, 4 warnings and 19 issue
rows**. The sample report contains 19 records plus its header.

## Run locally

From the project folder, start a static web server. For example, with Python 3:

```sh
cd content-qa-tool
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [localhost:8000](http://localhost:8000). Stop the server with Ctrl+C. If port
8000 is in use, choose another port in both the command and browser URL.

Papa Parse loads from jsDelivr, so an internet connection is required. Load Demo
downloads the bundled sample over HTTP/HTTPS; use a web server rather than
opening `index.html` with `file://`. Manual imports read the selected file in the
browser. Validation checks URL format without requesting product images.

## Use your own catalog

1. Choose a UTF-8 CSV file, then select **Import CSV**.
2. Review the product count, error/warning totals and issue explanations.
3. Select **Download QA Report** when issues are present.

The header must match this spelling, spacing and order:

```csv
sku,name,category,price,stock,description,image_url
```

Required fields are `sku`, `name`, `category`, `price` and `stock`. SKUs must be
unique after trimming and ignoring capitalization. Prices must be positive,
using a dot and no more than two decimal places. Stock must contain digits only;
zero is valid. Missing descriptions and missing/invalid HTTP(S) image URLs
produce warnings. Completely blank rows are ignored.

**Product row** starts at 1 for the first imported product, excluding the header
and skipped blank rows. It is not a physical CSV line number. A clean catalog
shows **No issues found**; the report button stays disabled.

Report columns are `product_row,sku,field,severity,message`. Reports contain
issues rather than complete product records. Selecting another file or starting
an import clears previous results and export data.

## Tests

Install Node.js 18 or newer and pnpm, then run from the project folder:

```sh
pnpm install --frozen-lockfile
pnpm test
```

The suite contains **29 tests** covering validation, the actual sample dataset,
demo/manual import equivalence, UI state, safe rendering, CSV quoting, formula
escaping and report downloads. Dependencies are needed only for tests; the app
itself does not require installation.

Browser QA covered the complete workflow, keyboard navigation and viewport
widths from 320 to 1280 CSS pixels. Cross-browser, physical-device and
screen-reader checks remain outstanding; see the [QA report](QA-REPORT.md).

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Accessible page structure and controls |
| `styles.css` | Responsive layout and visual styles |
| `app.js` | Import/demo workflow, DOM updates and report download |
| `validation.js` | Reusable product validation functions |
| `sample-products.csv` | Fictional demo catalog and test fixture |
| `app.test.js` | Interface, demo and report tests |
| `validation.test.js` | Validation engine tests |

## Technical documentation

The [technical guide](docs/TECHNICAL.md) explains parsing versus validation,
issue objects, functions, loops, regular expressions, DOM updates and the report
export implementation. The [QA report](QA-REPORT.md) records verified behavior,
known limitations and static-hosting requirements.

For a future GitHub Pages deployment, keep the five runtime files together in
the chosen publishing source. Local assets use relative paths, including the
demo CSV, so repository-subfolder hosting is supported. Repository preparation
does not enable Pages or publish a live site.
