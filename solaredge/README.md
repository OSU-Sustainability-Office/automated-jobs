# SolarEdge Webscraper

Scrapes daily solar energy yield from the SolarEdge monitoring portal for OSU Forestry and OSU Valley Football buildings.

## Usage

```bash
node readSolarEdge.js
```

### Flags

- `--no-upload` — Runs the scraper but does not upload data to the database. Useful for local testing.
- `--headful` — Runs the browser in visible mode for debugging. Without this flag, the browser runs headlessly.
- `--local-api` — Uses the localhost API instead of the production API. Requires the Energy Dashboard backend to be running locally.

## Environment Variables

Create a `.env` file in this directory with the following:

```
SOLAREDGE_LOGINPAGE=https://monitoring.solaredge.com/mfe/auth/
SOLAREDGE_USERNAME=your_username
SOLAREDGE_PWD=your_password
DASHBOARD_API=https://api.sustainability.oregonstate.edu/v2/energy
LOCAL_API=http://127.0.0.1:3000
```

## Debugging

Use `--headful` to watch the browser navigate in real time.
Use `--no-upload` to prevent writing to the production database during testing.
