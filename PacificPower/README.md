## PacificPower

Retrieves energy data for several meters from Pacific Power website. Runs once every day, and checks the database for the last 30 days worth of data to upload any missing days for each meter (`CONFIG.MAX_PREV_DAY_COUNT`, which must stay in sync with the `/pprecent` window in the energy-dashboard backend). It also checks the database for a meter exclusion list, as there are many meters on the website that we don't want to upload data for. If it encounters a new meter, it uploads it to the database with a status of `new`. Emails alerts integrated for new meters and failed uploads.

- `node readPP.js --account=CASCADES --save-output --no-upload --headful --local-api`
  - `--account=<NAME>` Optional argument. Selects which Pacific Power login to scrape. OSU bills under more than one account, and the meter dropdown only lists meters belonging to whoever is signed in, so each account needs its own run. Credentials are read from `PP_<NAME>_LOGINPAGE` / `_ACCOUNTPAGE` / `_USERNAME` / `_PWD`, falling back to the bare `PP_*` variables when the account-scoped one isn't set.
    - `node readPP.js` — Corvallis (the original account; behaves exactly as before)
    - `node readPP.js --account=CASCADES` — OSU-Cascades in Bend
    - Nothing downstream is account-aware: `pacific_power_meter_group`, `pacific_power_data` and meter class 9990002 are all keyed on the Pacific Power meter number, which is unique across accounts.
    - The run fails fast with a named variable if a credential is missing.
  - `--no-upload` Optional argument. Runs the webscraper as normal but does not upload any meter data or new meters to the database.
  - `--save-output` Optional argument. Saves all of the meter data that is logged to the console into a JSON file to make it easier to read — `output.json`, or `output-<account>.json` when `--account` is given, so two runs don't overwrite each other.
  - `--headful` Optional argument for debugging. Runs the browser in headful mode, meaning that you can see the browser. Without this flag, the browser isn't visible. [Reference](https://developer.chrome.com/docs/chromium/new-headless).
  - `--local-api` Optional argument. Must be running the [Energy Dashboard](https://github.com/OSU-Sustainability-Office/energy-dashboard) backend locally, and the scraper will use the localhost API instead of the production API.

### Debugging

There are various comments and code commented out throughout `readPP.js` that are helpful when debugging, they can be found by searching for `debug` in the code.
Another helpful way to debug is to output all console logs into a text file to make it easy to read and search for specific keywords. Make sure you have a `logs` folder in the directory:

- `node readPP.js > logs/output.txt`

### Formatting

- `npm run format`
