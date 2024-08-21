## ennex-os

Retrieves some solar panel data from OSU Operations. Email alerts integrated for failed upload.

- `node readEnnex.js --no-upload --headful`
  - `--no-upload` Optional argument. Runs the webscraper as normal but does not upload the data to the database.
  - `--headful` Optional argument for debugging. Runs the browser in headful mode, meaning that you can see the browser. Without this flag, the browser isn't visible. [Reference](https://developer.chrome.com/docs/chromium/new-headless).

### Debugging

There are various comments and code commented out throughout `readEnnex.js` that are helpful when debugging, they can be found by searching for `debug` in the code.

### Formatting

- `npm run format`
