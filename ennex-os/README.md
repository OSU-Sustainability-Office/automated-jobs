## ennex-os

Retrieves some solar panel data from OSU Operations. Email alerts integrated for failed upload.

- `node readEnnex.js --no-upload`
  - `--no-upload` Optional argument. Runs the webscraper as normal but does not upload the data to the database.

### Debugging

There are various comments and code commented out throughout `readEnnex.js` that are helpful when debugging, they can be found by searching for `debug` in the code.

### Formatting

- `npm run format`
