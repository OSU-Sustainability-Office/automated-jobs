const https = require("https");
const moment = require("moment");
const validIDs = require("./validIDs.json").buildings;

const startDate = moment().subtract(2, "months").unix();
const endDate = moment().subtract(3, "days").unix();
//const endDate = moment().unix();
const formattedStartDate = startDate.toLocaleString();
const formattedEndDate = endDate.toLocaleString();
const duration = moment.duration(endDate - startDate, "seconds");
const daysDuration = Math.round(duration.asDays());
const formattedDuration = `${daysDuration} day${daysDuration !== 1 ? "s" : ""}`;

let totalBuildingData = [];
let buildingOutput;

const requests = validIDs.flatMap((buildings) => {
  const meterIds = buildings.meter[0].id;
  const meterlength = buildings.meter.length;
  let meterIdTable = [];
  let meterClassTable = [];

  //console.log(meterlength)

  for (i = 0; i < meterlength; i++) {
    let meterObject = {
      id: buildings.meter[i].id,
      class: buildings.meter[i].class,
      point: buildings.meter[i].point,
      point_name: buildings.meter[i].point_name,
    };
    //console.log(meterObject)
    meterIdTable.push(meterObject);
  }
  //console.log(meterTable)
  //console.log(meterIds)
  //console.log(buildings.meter.length)

  return meterIdTable.map((meterObj) => {
    //console.log(meterId)
    //console.log(meterObj.id)

    return new Promise((resolve, reject) => {
      //console.log(meterObj)
      const options = {
        hostname: "api.sustainability.oregonstate.edu",
        path: `/v2/energy/data?id=${meterObj.id}&startDate=${startDate}&endDate=${endDate}&point=${meterObj.point}&meterClass=${meterObj.class}`,
        method: "GET",
      };
      const req = https.request(options, (res) => {
        // console.log(options)
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const parsedData = JSON.parse(data);
          //console.log(parsedData)
          const building_name = buildings.building_name;
          const buildingID = buildings.building_id;
          const meter_groupID = buildings.meter_group_id;
          if (parsedData.length > 0) {
            const firstTime = parsedData[0].time;
            //console.log(parsedData[0])
            //console.log(firstTime)
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
            //console.log(buildingOutput);
            totalBuildingData.push(buildingOutput);
          } else {
            buildingOutput = `${building_name} (Building ID ${buildingID}, ${
              meterObj.point_name
            }, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
              ", "
            )}): No data within the past ${formattedDuration}`;
            //console.log(buildingOutput);
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
    // console.log("All requests completed");
    //console.log("Total building data:", totalBuildingData);

    const noData = [];
    const hasData = [];
    totalBuildingData.forEach((data) => {
      if (data.includes("No data within the past")) {
        noData.push(data);
      } else {
        hasData.push(data);
      }
    });

    const sortedData = [...noData, "", ...hasData].join("\n");

    console.log("All requests completed\n");
    console.log(sortedData);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
