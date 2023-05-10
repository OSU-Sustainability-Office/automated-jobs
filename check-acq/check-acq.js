const https = require("https");
const moment = require("moment");
const validIDs = require("./validIDs.json").buildings;

const startDate = moment().subtract(2, "months").unix();
//const endDate = moment().subtract(3, "days").unix();
const endDate = moment().unix();
const duration = moment.duration(endDate - startDate, "seconds");
const daysDuration = Math.round(duration.asDays());
const formattedDuration = `${daysDuration} day${daysDuration !== 1 ? "s" : ""}`;

let totalBuildingData = [];
let buildingOutput;

const requests = validIDs.flatMap((buildings) => {
  const meterlength = buildings.meter.length;
  let meterIdTable = [];

  for (i = 0; i < meterlength; i++) {
    let meterObject = {
      id: buildings.meter[i].id,
      class: buildings.meter[i].class,
      point: buildings.meter[i].point,
      point_name: buildings.meter[i].point_name,
    };
    meterIdTable.push(meterObject);
  }

  return meterIdTable.map((meterObj) => {

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.sustainability.oregonstate.edu",
        path: `/v2/energy/data?id=${meterObj.id}&startDate=${startDate}&endDate=${endDate}&point=${meterObj.point}&meterClass=${meterObj.class}`,
        method: "GET",
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const parsedData = JSON.parse(data);
          const building_name = buildings.building_name;
          const buildingID = buildings.building_id;
          const meter_groupID = buildings.meter_group_id;
          if (parsedData.length > 0) {
            const firstTime = parsedData[0].time;
            const timeDifference = moment().diff(
              moment.unix(firstTime),
              "seconds"
            );

            let timeDifferenceText;

            if (timeDifference < 3600) {
              // If less than an hour, express in minutes
              const minutes = Math.floor(timeDifference / 60);
              timeDifferenceText = `${minutes} minute${minutes > 1 ? "s" : ""}`;
            } else if (timeDifference < 86400) {
              // If between 1 hour and 1 day, express in hours
              const hours = Math.floor(timeDifference / 3600);
              timeDifferenceText = `${hours} hour${hours > 1 ? "s" : ""}`;
            } else {
              // If 1 day or more, express in days
              const days = Math.floor(timeDifference / 86400);
              timeDifferenceText = `${days} day${days > 1 ? "s" : ""}`;
            }
            buildingOutput = `${building_name} (Building ID ${buildingID}, ${
              meterObj.point_name
            }, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
              ", "
            )}): Data within the past ${timeDifferenceText}`;
            totalBuildingData.push(buildingOutput);
          } else {
            buildingOutput = `${building_name} (Building ID ${buildingID}, ${
              meterObj.point_name
            }, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
              ", "
            )}): No data within the past ${formattedDuration}`;
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

      const meter_A = parseInt(a.match(/Meter ID (\d+)/)[1]);
      const meter_B = parseInt(b.match(/Meter ID (\d+)/)[1]);

      if (building_ID_A === building_ID_B) {
        return meter_A - meter_B;
      } else {
        return building_ID_A - building_ID_B;
      }
    });

    const noData = [];
    const hasData = [];
    const regex = /(Data) within the past (\d+) (minute|hour|day|minutes|hours|days)?/;

    totalBuildingData.forEach((data) => {
      const match = data.match(regex);
      if (match) {
        const unit = match[3];
        const timeAgo = parseInt(match[2]);
        if ((unit === 'days' || unit === 'day') && timeAgo > 2) {
          noData.push(data);
        } else {
          hasData.push(data);
        }
      } else {
        noData.push(data);
      }
    });

    console.log("Buildings with Missing Data:\n");
    console.log(noData)
    console.log("Buildings with Valid Data:\n");
    console.log(hasData)
  })
  .catch((error) => {
    console.error("Error:", error);
  });
