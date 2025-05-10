/* This script fetches GeoJSON data from the Overpass API and uploads it via the Energy Dashboard API.
    * It was designed to reduce overhead and improve performance by elimanating the need to fetch the data
    * from the client side. It is meant be run as a cron job to keep the GeoJSON data up to date.
    * The script does the following:
        1. Fetches all building data from the Energy Dashboard API
        2. Fetches GeoJSON data from the Overpass API using the building IDs
        3. Normalizes the GeoJSON data to ensure it is ready to be used in the Energy Dashboard
        4. Updates the GeoJSON data in the database with the new building properties using the Energy Dashboard API
*/

// Imports
require("dotenv").config();
const axios = require("axios");
const DOMParser = require("@xmldom/xmldom").DOMParser;
const osmtogeojson = require("osmtogeojson");

// Constants
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;

async function fetchAllBuildingData() {
  try {
    const response = await axios({
      method: "get",
      url: `${DASHBOARD_API}/allbuildings`,
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching building data:", error);
    throw error;
  }
}

async function fetchGeoJSONData(Ids) {
  try {
    const base = "https://maps.mail.ru/osm/tools/overpass/api";
    const route = `interpreter?data=[out:xml];way(id:${Ids});(._;>;);out;`;
    const osmXML = await axios({
      method: "get",
      url: `${base}/${route}`,
      headers: {
        Accept: "text/xml",
      },
    });

    // Parse the OSM XML response
    const xmlDoc = new DOMParser().parseFromString(osmXML.data, "text/xml");
    const geojson = osmtogeojson(xmlDoc);
    return geojson;
  } catch (error) {
    console.error("Error fetching GeoJSON data:", error);
    throw error;
  }
}

/* This function creates a map of building objects with the following properties:
 * Key: The OSM way ID of the building
 * Value: An object containing the following properties:
 * buildingId: The ID of the building
 * buildingName: The name of the building
 * buildingGroup: The group of the building
 */
async function createbuildingMap() {
  const buildingData = await fetchAllBuildingData();
  const buildingMap = new Map();

  for (const building of buildingData) {
    if (!building.mapId) continue; // Skip buildings with blank wayId

    buildingMap.set(building.mapId, {
      buildingId: parseInt(building.id),
      buildingName: building.name,
      buildingGroup: building.group,
    });
  }

  return buildingMap;
}

// Some buildings are Polygons by definition, but are returned as LineStrings
// by OSM. This function corrects the geometry type if necessary.
function correctGeometry(feature) {
  if (feature.geometry.type === "LineString") {
    const coords = feature.geometry.coordinates;
    if (
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1]
    ) {
      feature.geometry.type = "Polygon";
      feature.geometry.coordinates = [coords];
    }
  }
}

/* The energy dashboard uses these properties to identify and setup
 * buildings on the map. This function sets the properties of each feature
 * in the GeoJSON data to match the building objects.
 */
function setBuildingProperties(feature, building) {
  feature.properties = {
    id: building.buildingId,
    group: building.buildingGroup,
    name: building.buildingName,
  };
}

/*
 * This function normalizes the GeoJSON data to ensure the data is ready to
 * be used in the Energy Dashboard.
 */
function normalizeData(buildingMap, geojson) {
  const normalizedBuildingArray = [];

  for (const feature of geojson.features) {
    const wayOrNode = String(feature.id.split("/")[0]);
    if (wayOrNode !== "way") {
      continue; // Ignore node features
    }

    const wayId = String(feature.id.split("/")[1]);
    const building = buildingMap.get(wayId);

    if (building) {
      // Set the properties of the feature
      setBuildingProperties(feature, building);

      // Set the geometry type to Polygon if it is a closed shape
      correctGeometry(feature);

      // Add the feature to the normalized building array
      normalizedBuildingArray.push({
        buildingId: building.buildingId,
        buildingGeoJSON: feature,
      });

      // Remove building from map to indicate it has been processed
      buildingMap.delete(wayId);
    }
  }

  // Trigger an error if a building has not been found in the GeoJSON data (usually indicates invalid wayId)
  if (buildingMap.size > 0) {
    console.error(
      "The following buildings were not found in the GeoJSON data:",
      Array.from(buildingMap.values()),
    );
  }
  return normalizedBuildingArray;
}

// This function updates the GeoJSON data in the database
// with the new building properties using the Energy Dashboard API.
async function updateGeoJSONData(buildings) {
  try {
    const response = await axios({
      method: "put",
      url: `${DASHBOARD_API}/buildinggeojson`,
      data: {
        buildings: buildings,
        pwd: process.env.API_PWD,
      },
    });
    return response;
  } catch (error) {
    console.error("Error updating GeoJSON data:", error);
    throw error;
  }
}

async function main() {
  // Build a map of wayId to building properties
  const buildingMap = await createbuildingMap();

  // Get OSM data for all buildings
  const wayIds = Array.from(buildingMap.keys()).join(",");
  const geojson = await fetchGeoJSONData(wayIds);

  // Prepare the GeoJSON data
  const normalizedBuildingArray = normalizeData(buildingMap, geojson);

  // Update the database with the new GeoJSON data
  if (!process.argv.includes("--no-upload")) {
    const response = await updateGeoJSONData(normalizedBuildingArray);
    console.log(response.data);
  }
}

// Execute the main function
main();
