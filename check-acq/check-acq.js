const https = require("https");
const moment = require("moment");
const validIDs = require("./validIDs.json").buildings;

// by default, the requests sent to our API use a 2 month timeframe for energy graphs, so I emulated it here
const startDate = moment().subtract(2, "months").unix();
//const endDate = moment().subtract(2, "days").unix();
const endDate = moment().unix();
const duration = moment.duration(endDate - startDate, "seconds");
const daysDuration = Math.round(duration.asDays());
const formattedDuration = `${daysDuration} day${daysDuration !== 1 ? "s" : ""}`;

let totalBuildingData = [];
let missedBuildings = [];
let buildingOutput;
let noChangeData = [];
let noChange4Or5Data = [];

console.log("Acquisuite Data Checker\n");

const requests = validIDs.flatMap((buildings) => {
  const meterlength = buildings.meter.length;
  let meterIdTable = [];

  // exclude buildings 35 to 38 as they are tesla solar panel buildings currently handled by Iframes
  if (
    meterlength === 0 &&
    buildings.building_id !== 35 &&
    buildings.building_id !== 36 &&
    buildings.building_id !== 37 &&
    buildings.building_id !== 38
  ) {
    // need to retire this later maybe due to new 3Or4Day alert implementation. Buildings not tracked due to no data for years
    missedBuildings.push(
      `${buildings.building_name} (Building ID ${buildings.building_id}): Unclear Error; See meter_comments from validIDs.json for more info`,
    );
  }

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
          const lastObjectIndex = parsedData.length - 1;

          if (parsedData.length > 0) {
            const timeValues = [];

            for (const obj of parsedData) {
              timeValues.push(obj.time);
            }

            const firstKeyValues = parsedData.map((obj) => {
              const keys = Object.keys(obj);
              return keys.length > 0 ? obj[keys[0]] : undefined;
            });

            function findClosestWithIndex(array, num) {
              return array.reduce(
                function (prev, curr, index) {
                  const prevDiff = Math.abs(prev.value - num);
                  const currDiff = Math.abs(curr - num);

                  if (currDiff < prevDiff) {
                    return { value: curr, index: index };
                  } else {
                    return prev;
                  }
                },
                { value: array[0], index: 0 },
              );
            }

            /*
            first 6 days equal to each other = noChangeData
            first 4 days equal to each other, and then 4 or 5 aren't equal = noChange5Or6Data
            Overall purpose of the if and else if code block below is to track buildings with no change in data,
            which may be a sign of meter errors (as seen historically for some gas meters)
            */

            if (
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(1, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(2, "days").unix(),
                  ).index
                ] &&
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(2, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(3, "days").unix(),
                  ).index
                ] &&
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(3, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(4, "days").unix(),
                  ).index
                ] &&
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(4, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(5, "days").unix(),
                  ).index
                ] &&
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(5, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(6, "days").unix(),
                  ).index
                ] &&
              moment().diff(moment.unix(parsedData[0].time), "days") <= 2
            ) {
              buildingOutput = `${building_name} (Building ID ${buildingID}, ${
                meterObj.point_name
              }, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
                ", ",
              )}): No Change in Data (Old, At Least 6 Days)`;
              noChangeData.push(buildingOutput);
            } else if (
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(1, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(2, "days").unix(),
                  ).index
                ] &&
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(2, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(3, "days").unix(),
                  ).index
                ] &&
              firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(3, "days").unix(),
                ).index
              ] ===
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(4, "days").unix(),
                  ).index
                ] &&
              (firstKeyValues[
                findClosestWithIndex(
                  timeValues,
                  moment().subtract(4, "days").unix(),
                ).index
              ] !==
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(5, "days").unix(),
                  ).index
                ] ||
                firstKeyValues[
                  findClosestWithIndex(
                    timeValues,
                    moment().subtract(5, "days").unix(),
                  ).index
                ] !==
                  firstKeyValues[
                    findClosestWithIndex(
                      timeValues,
                      moment().subtract(6, "days").unix(),
                    ).index
                  ]) &&
              moment().diff(moment.unix(parsedData[0].time), "days") <= 2
            ) {
              buildingOutput = `${building_name} (Building ID ${buildingID}, ${
                meterObj.point_name
              }, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
                ", ",
              )}): No Change in Data (New, 4 or 5 Days)`;
              noChange4Or5Data.push(buildingOutput);
            }

            // anything that made it to this else block is presumed to have changing and nonzero data
            else {
              let firstTime = parsedData[0].time;
              if (meterObj.point_name === "Solar") {
                firstTime = parsedData[lastObjectIndex].time;
              }
              const timeDifference = moment().diff(
                moment.unix(firstTime),
                "seconds",
              );

              let timeDifferenceText;

              if (timeDifference < 3600) {
                // If less than an hour, express in minutes
                const minutes = Math.floor(timeDifference / 60);
                timeDifferenceText = `${minutes} minute${
                  minutes > 1 ? "s" : ""
                }`;
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
                ", ",
              )}): Data within the past ${timeDifferenceText}`;
              totalBuildingData.push(buildingOutput);
            }
          }

          // for meters that are tracked in the database but still return no data
          else {
            buildingOutput = `${building_name} (Building ID ${buildingID}, ${
              meterObj.point_name
            }, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
              ", ",
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

    const noData3Or4 = [];
    const noData = [];
    const hasData = [];
    const regex =
      /within the past (\d+) (second|minute|hour|day|seconds|minutes|hours|days)?/;

    totalBuildingData.forEach((data) => {
      const match = data.match(regex);
      if (match) {
        const unit = match[2];
        const timeAgo = parseInt(match[1]);
        if (
          (unit === "days" || unit === "day") &&
          (timeAgo === 3 || timeAgo === 4)
        ) {
          noData3Or4.push(data);
        } else if ((unit === "days" || unit === "day") && timeAgo > 4) {
          noData.push(data);
        } else {
          hasData.push(data);
        }
      } else {
        noData.push(data);
      }
    });

    if (noData.length > 0) {
      console.log("Meter Outages Detected\n");
    }

    if (noData3Or4.length > 0) {
      console.log("Meter Outages 3 or 4 Days Detected\n");
    }

    if (noChange4Or5Data.length > 0) {
      console.log("Meters with Unchanging Data 4 or 5 Days Detected\n");
    }

    if (noChangeData.length > 0) {
      console.log("Meters with Unchanging Data Detected\n");
    }

    console.log("===============\n");

    console.log("New Buildings with Missing Data (3 or 4 Days):\n");
    console.log(noData3Or4);
    console.log("\n");
    console.log("Buildings with Missing Data (For a Long Time):\n");
    console.log(noData);
    console.log("\n");
    console.log("Buildings Currently Not Tracked (Manual Override):\n");
    console.log(missedBuildings);
    console.log("\n");
    console.log("Buildings with No Change in Data (New, 4 or 5 Days):\n");
    console.log(noChange4Or5Data);
    console.log("\n");
    console.log("Buildings with No Change in Data (Old, At Least 6 Days):\n");
    console.log(noChangeData);
    console.log("\n");
    console.log("Buildings with Valid Data:\n");
    console.log(hasData);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
