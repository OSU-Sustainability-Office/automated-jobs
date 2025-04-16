// Imports
const axios = require("axios");
require('dotenv').config()
const DOMParser = require('xmldom').DOMParser;
const osmtogeojson = require('osmtogeojson');

// Constants
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;

// Fetch all building data from database
async function fetchBuildingData() {
    const buildingData = await axios({
    method: "get",
    url: `${DASHBOARD_API}/allbuildings`,
    })
    return buildingData.data;
}

// Extract all building ID and Way IDs from building data
async function extractBuildingIds() {
    const buildingData = await fetchBuildingData();
    const buildingInfo = buildingData
        .filter(building => building.mapId) // Exclude buildings with blank wayId
        .map(building => ({
            buildingId: parseInt(building.id),
            wayId: building.mapId
        }));
    return buildingInfo;
}

// Get GeoJSON data from OSM
async function fetchGeoJSONData(Ids) {
    const base = 'https://maps.mail.ru/osm/tools/overpass/api';
    const route = `interpreter?data=[out:xml];way(id:${Ids});(._;>;);out;`
    const osmXML = await axios({
        method: "get",
        url: `${base}/${route}`,
    });

    // Parse the OSM XML response
    const doc = new DOMParser().parseFromString(osmXML);
    const geojson = osmtogeojson(doc);

    return geojson;
}

// Update GeoJSON data in MySQL
async function updateGeoJSONData(buildingId, geojson) {
    const response = await axios({
        method: "put",
        url: `${DASHBOARD_API}/buildinggeojson`,
        data: {
            'id': buildingId,
            'geoJSON': geojson
        }
    });
    return response.data;
}

async function main() {
    // Get the ID and Way ID from MySQL
    const buildingInfo = await extractBuildingIds();

    // Create a map of wayId to buildingId
    const mapIdToBuildingId = new Map();
    const mapIds = buildingInfo.map(b => {
      mapIdToBuildingId.set(b.wayId, b.buildingId);
      return b.wayId;
    });

    // Get OSM data for all buildings
    const wayIds = mapIds.join(',');
    const geojson = await fetchGeoJSONData(wayIds);

    // Build a map of buildingId to GeoJSON feature
    const buildingGeoMap = new Map();
    for (const feature of geojson.features) {
      const osmId = feature.id.split('/')[1]; // e.g. "way/123456" → "123456"
      const buildingId = mapIdToBuildingId.get(osmId);
      if (buildingId) {
        buildingGeoMap.set(buildingId, feature);
      }
    }

    // Update first building for testing
    const firstBuildingId = Array.from(buildingGeoMap.keys())[0];
    const firstGeoJSON = buildingGeoMap.get(firstBuildingId);
    const firstGeoJSONString = JSON.stringify(firstGeoJSON);
    const firstUpdateResponse = await updateGeoJSONData(firstBuildingId, firstGeoJSONString);
    console.log(firstUpdateResponse);
}

// Execute the main function
main()
