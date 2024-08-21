## PacificPower

Retrieves energy data for several meters from Pacific Power website. Runs once every day, and checks the database for the last 7 days worth of data to upload any missing days for each meter. It also checks the database for a meter exclusion list, as there are many meters on the website that we don't want to upload data for. If it encounters a new meter, it uploads it to the database with a status of `new`. Emails alerts integrated for new meters and failed uploads.

- `node readPP.js --save-output --no-upload`
  - `--no-upload` Optional argument. Runs the webscraper as normal but does not upload any meter data or new meters to the database.
  - `--save-output` Optional argument. Saves all of the meter data that is logged to the console into a JSON file `output.json` to make it easier to read.

### Debugging

There are various comments and code commented out throughout `readPP.js` that are helpful when debugging, they can be found by searching for `debug` in the code.

### Formatting

- `npm run format`
