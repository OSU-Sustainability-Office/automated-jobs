## refresh-osm

Retrieves building outline data in GeoJSON format from the Overpass API (OpenStreetMap) and stores it in the buildings table of the database. Used primarily for rendering building outlines on the map. Runs bi-weekly.

- `node refresh-osm.js --no-upload --local-api`
  - `--no-upload` Optional argument. Runs the webscraper as normal but does not upload any GeoJSON data to the database.
  - `--local-api` Optional argument. Must be running the [Energy Dashboard](https://github.com/OSU-Sustainability-Office/energy-dashboard) backend locally, and the scraper will use the localhost API instead of the production API.

### Formatting

- `npm run format`
