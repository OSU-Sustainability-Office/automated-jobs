const https = require("https");
const moment = require("moment");
const validIDs = require("./validIDs.json").buildings;

const startDate = moment().subtract(2, "months").unix();
const endDate = moment().unix();
const formattedStartDate = startDate.toLocaleString();
const formattedEndDate = endDate.toLocaleString();
const duration = moment.duration(endDate - startDate, 'seconds');
const formattedDuration = duration.humanize();

let totalBuildingData = [];
let buildingOutput;

const requests = validIDs.flatMap((buildings) => {
  const meterIds = buildings.meter_id;
  return meterIds.map((meterId) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.sustainability.oregonstate.edu",
        path: `/v2/energy/data?id=${meterId}&startDate=${startDate}&endDate=${endDate}&point=accumulated_real&meterClass=48`,
        method: "GET",
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const parsedData = JSON.parse(data);
          //console.log(parsedData)
          const building_name = buildings.building_name;
          const buildingID = buildings.building_id;
          const meter_groupID = buildings.meter_id;
          if (parsedData.length > 0) {
            const firstTime = parsedData[0].time;
            const timeDifference = moment().diff(
              moment.unix(firstTime),
              "minutes"
            );
            buildingOutput = `${building_name} (Building ID ${buildingID}, Meter ID ${meterId}, Meter Group ID ${meter_groupID.join(', ')}): Data within the past ${timeDifference} minutes.`;
            console.log(buildingOutput);
            totalBuildingData.push(buildingOutput);
          } else {
            buildingOutput = `${building_name} (Building ID ${buildingID}, Meter ID ${meterId}, Meter Group ID ${meter_groupID.join(', ')}): No data within the past ${formattedDuration}`;
            console.log(buildingOutput);
            totalBuildingData.push(buildingOutput);
          }
          resolve();
        });
      });
      req.on("error", (error) => {
        console.error(error);
        reject(error);
      });
      req.end();
    });
  });
});

Promise.all(requests)
  .then(() => {
    totalBuildingData.sort((a, b) => {
      const building_ID_A = parseInt(a.match(/Building ID (\d+)/)[1]);
      const building_ID_B = parseInt(b.match(/Building ID (\d+)/)[1]);

      const meter_ID_A = parseInt(a.match(/Meter ID (\d+)/)[1]);
      const meter_ID_B = parseInt(b.match(/Meter ID (\d+)/)[1]);

      if (building_ID_A === building_ID_B) {
        return meter_ID_A - meter_ID_B;
      } else {
        return building_ID_A - building_ID_B;
      }
    });
    console.log("All requests completed");
    console.log("Total building data:", totalBuildingData);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
