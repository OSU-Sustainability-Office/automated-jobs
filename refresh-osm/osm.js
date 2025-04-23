// Imports
require('dotenv').config()
const axios = require("axios");
const DOMParser = require('@xmldom/xmldom').DOMParser;
const osmtogeojson = require('osmtogeojson');

// Constants
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;
 
async function fetchAllBuildingData() {
    const buildingData = await axios({
    method: "get",
    url: `${DASHBOARD_API}/allbuildings`,
    })
    return buildingData.data;
}

async function mapWayIdtoBuildingId() {
    const buildingData = await fetchAllBuildingData();
    const mapIdToBuildingId = new Map();

    // Create a map of wayId to building
    buildingData
        .filter(building => building.mapId) // Exclude buildings with blank wayId
        .forEach(building => {
            const wayId = building.mapId;
            const buildingId = parseInt(building.id);
            mapIdToBuildingId.set(wayId, buildingId);
        });

    return mapIdToBuildingId;
}

// Get GeoJSON data from OSM using Overpass API
async function fetchGeoJSONData(Ids) {
    const base = 'https://maps.mail.ru/osm/tools/overpass/api';
    const route = `interpreter?data=[out:xml];way(id:${Ids});(._;>;);out;`
    const osmXML = await axios({
        method: "get",
        url: `${base}/${route}`,
        headers: {
             Accept: 'text/xml'
        },
    });

    // Parse the OSM XML response
    const xmlDoc = new DOMParser().parseFromString(osmXML.data, 'text/xml');
    const geojson = osmtogeojson(xmlDoc);
    return geojson;
}

// Update GeoJSON data in MySQL
async function updateGeoJSONData(buildings) {
    const response = await axios({
        method: "put",
        url: `${DASHBOARD_API}/buildinggeojson`,
        data: {
            buildings: buildings
        }
    });
    return response;
}

// Some buildings are Polygons by definition, but are returned as LineStrings
// by OSM. This function corrects the geometry type if necessary.
async function correctGeometry(feature) {
    // Convert LineString to Polygon if it is a closed shape
    if (feature.geometry.type === 'LineString') {
        const coords = feature.geometry.coordinates
        if (coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]) {
            feature.geometry.type = 'Polygon'
            feature.geometry.coordinates = [coords]
        }
    }
}

async function main() {
    // Build a map of wayId to buildingId
    const mapIdToBuildingId = await mapWayIdtoBuildingId();

    // Get OSM data for all buildings
    const wayIds = mapIdToBuildingId.join(',');
    const geojson = await fetchGeoJSONData(wayIds);

    // Correct the geometry type if necessary
    for (const feature of geojson.features) {
        await correctGeometry(feature);
    }

    // Build a map of buildingId to GeoJSON feature
    const buildingGeoMap = new Map();
    for (const feature of geojson.features) {
      const osmId = feature.id.split('/')[1]; // e.g. "way/123456" → "123456"
      const buildingId = mapIdToBuildingId.get(osmId);
      if (buildingId) {
        const buildingIdInt = parseInt(buildingId);
        buildingGeoMap.set(buildingIdInt, feature);
      }
    }

    // Convert the map to an array of objects
    const buildingGeoArray = Array.from(buildingGeoMap, ([id, geoJSON]) => ({
        buildingId: id,
        buildingGeoJSON: geoJSON
    }));

    // Update the database with the new GeoJSON data
    const updateResponse = await updateGeoJSONData(buildingGeoArray);
    console.log(updateResponse.data);
}

// Execute the main function
main()
