## SEC

Retrieves some solar panel data from Student Experience Center. Email alerts integrated for failed upload.

- `node readSEC.js --no-upload --headful --local-api`
  - `--no-upload` Optional argument. Runs the webscraper as normal but does not upload the data to the database.
  - `--headful` Optional argument for debugging. Runs the browser in headful mode, meaning that you can see the browser. Without this flag, the browser isn't visible. [Reference](https://developer.chrome.com/docs/chromium/new-headless).
  - `--local-api` Optional argument. Must be running the [Energy Dashboard](https://github.com/OSU-Sustainability-Office/energy-dashboard) backend locally, and the scraper will use the localhost API instead of the production API.

### Debugging

There are various comments and code commented out throughout `readSEC.js` that are helpful when debugging, they can be found by searching for `debug` in the code.

### Formatting

- `npm run format`
