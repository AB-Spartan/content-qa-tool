# QA report

Audit date: 20 October 2026. Verdict: **ready for static deployment**, with the
browser/device and live-host checks below still outstanding. No deployment was
performed and no GitHub repository or Pages settings were changed.

## Passed checks

- **Automated tests:** 29 passed, 0 failed, before and after the fix. Tests cover
  the validation engine, import/demo state, rendering, report generation,
  malformed inputs, safe DOM text, CSV quoting and formula escaping.
- **Real browser demo:** 12 products, 15 errors, 4 warnings, 19 issue rows.
- **Real browser manual import:** the actual sample produced the same counts;
  selecting another file cleared previous results and disabled export.
- **Empty/success states:** a clean two-product catalog showed 2/0/0 and No issues
  found; a header-only catalog showed 0/0/0 with export disabled.
- **Import failures:** reordered headers and a malformed data row showed clear
  messages, placeholder counts, no old issues and disabled export. Recovery by
  importing another file or loading the demo worked.
- **Real download:** downloaded a fresh report from the repository-style test
  URL and independently parsed the saved file. Header order was exactly
  `product_row,sku,field,severity,message`; 19 records, 15 errors, 4 warnings.
  Automated checks also cover commas, quotation marks, newlines, Unicode, and
  single/multiline spreadsheet formula strings.
- **Responsive layouts:** inspected desktop and mobile rendering and measured
  reflow at widths 320, 390, 768 and 1280 CSS pixels. After the fix, the document
  stayed within every tested viewport. Horizontal overflow stayed inside the
  results table; summary cards stacked on phone widths.
- **Keyboard:** Load Demo activated with Enter; Tab continued to the file picker,
  report button, sample link and results region. The region showed a visible
  inward focus outline; an arrow-key press scrolled its contents by 40px at a
  390px viewport. No keyboard trap was observed.
- **Basic accessibility review:** one h1, connected file label, unique IDs,
  valid label/ARIA references, five scoped table headers, a caption, visible
  severity words and a polite live status. Sampled text/button/badge color pairs
  had contrast ratios from 6.05:1 to 14.42:1. This is not a WCAG certification.
- **Console:** no JavaScript errors or console warnings were captured by the
  accessible in-app browser during the exercised workflows.
- **Static-host compatibility:** tested under `/content-qa-tool/`, rather than
  only at the origin root. HTML, CSS, both app scripts and the sample CSV all
  returned HTTP 200 with appropriate MIME types. Demo, relative links and report
  download worked there. Local assets use relative paths, the external library
  uses HTTPS, and no application build/backend is required.

## Issue fixed

**Mobile invalid-header message overflow.** The exact comma-separated header in
the status message was an unbroken word. At a 320px viewport it expanded the
document to 382px, clipping the message and introducing page-level horizontal
scrolling. Added `overflow-wrap: anywhere` to `#import-status` in styles.css.
Reimported the failing CSV at 320px: the document remained 320px and the status
content fit its 246px-wide text area. No validation or export behavior changed.

No other material functional or publication-blocking issue was found within the
tested scope. The JavaScript behavior, validation rules and design were retained.

## Remaining limitations and uncompleted checks

- Browser interactions were completed in the audit environment’s in-app browser.
  Chrome, Safari and Firefox were not tested.
- Mobile checks used browser viewport resizing, not physical iOS/Android devices.
  Screen-reader output, native mobile download behavior and OS-level high
  contrast were not verified. Keyboard and DOM semantics were checked directly.
- Large-file performance and actual Excel/LibreOffice formula interpretation
  were not tested. CSV contents and the configured escaping were tested.
- Some failure cases (missing CDN library, network/read failures and unexpected
  reader exceptions) are covered by controlled automated simulations rather
  than every corresponding real network/OS failure.
- Papa Parse is loaded from jsDelivr: runtime internet/CDN availability is still
  required. Demo loading requires HTTP/HTTPS, not `file://`.
- No public GitHub Pages deployment, HTTPS certificate, caching behavior,
  repository permissions or custom domain was tested. Pages configuration and a
  live-host smoke test remain deployment steps.
- The local server recorded automatic `/favicon.ico` requests returning 404;
  the app does not declare a favicon. This is cosmetic and was left unchanged
  under the instruction to fix only material issues.

## Deployment handoff

Use this project folder as the repository root, with these runtime files together:
`index.html`, `styles.css`, `app.js`, `validation.js`, `sample-products.csv`.
Keep test files and documentation in the source repository if desired; do not
publish local node_modules or Finder metadata.

For the straightforward branch-based setup, choose the publishing branch and
`/(root)` in repository Settings → Pages. Alternatively, put the runtime files
together in `/docs` and select that folder. GitHub's branch source selector
supports root or `/docs`, not an arbitrary nested project folder. The entry file
must be at the top of the chosen source. See the official
[publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [entry-file requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

Once published, smoke-test the actual Pages URL: load demo (12/15/4 and 19 issues),
import the sample, download and inspect the report, check a narrow viewport and
confirm the browser console has no unexpected errors. Complete the browser and
assistive-technology checks above before claiming broad compatibility.
