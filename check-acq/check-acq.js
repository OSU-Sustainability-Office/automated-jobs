const https = require("https");
const axios = require("axios");
const moment = require("moment-timezone");
const blacklist = require("./blacklist.json");

// refer to local ./allBuildings.json file for a template - node format-allBuildings.js
// const allBuildings = require("./allBuildings.json");

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
let blacklistMeterTable = [];
let startTime = new Date();

const apiUrl =
  "https://api.sustainability.oregonstate.edu/v2/energy/allbuildings";

axios
  .get(apiUrl)
  .then((response) => {
    if (response.status === 200) {
      const allBuildings = response.data;

      console.log("Acquisuite Data Checker\n");

      for (let i = 0; i < blacklist.length; i++) {
        for (let j = 0; j < blacklist[i]._meter_comments.length; j++) {
          let blacklistMeterObject = {
            building_id: blacklist[i].building_id,
            building_name: blacklist[i].building_name,
            meter_id: blacklist[i]._meter_comments[j].id,
            meter_note: blacklist[i]._meter_comments[j].note,
          };
          blacklistMeterTable.push(blacklistMeterObject);
        }
      }

      const requests = allBuildings.flatMap((buildings) => {
        let meterIdTable = [];
        let meterGroupTable = [];
        let finalMissedBuildingTable = [];

        const meterGroupLength = buildings.meterGroups.length;
        const building_hidden = buildings.hidden;
        let building_hidden_text = "";
        if (building_hidden === true) {
          building_hidden_text = " (Building Hidden)";
        }
        for (let i = 0; i < meterGroupLength; i++) {
          // skip buildings with null meter groups
          if (buildings.meterGroups[i].id === "null") {
            continue;
          }
          const meterLength = buildings.meterGroups[i].meters.length;
          meterGroupTable.push(buildings.meterGroups[i].id);
          for (let j = 0; j < meterLength; j++) {
            let point_var = "";

            if (buildings.meterGroups[i].meters[j].type === "Electricity") {
              point_var = "accumulated_real";
            } else if (buildings.meterGroups[i].meters[j].type === "Gas") {
              point_var = "cubic_feet";
            } else if (buildings.meterGroups[i].meters[j].type === "Steam") {
              point_var = "total";
            } else if (
              buildings.meterGroups[i].meters[j].type === "Solar Panel"
            ) {
              point_var = "energy_change";
            }

            let meterObject = {
              id: parseInt(buildings.meterGroups[i].meters[j].id),
              class: buildings.meterGroups[i].meters[j].classInt,
              point: point_var,
              points: buildings.meterGroups[i].meters[j].points,
              meterGroupString: [
                buildings.meterGroups[i].name +
                  " (ID: " +
                  buildings.meterGroups[i].id +
                  ")",
              ],
              point_name: buildings.meterGroups[i].meters[j].type,
            };

            const checkDupMeter = (obj) =>
              obj.id === parseInt(buildings.meterGroups[i].meters[j].id);

            let blacklistedMeterIDs = blacklistMeterTable.map(
              (a) => a.meter_id,
            );

            if (
              !blacklistedMeterIDs.includes(
                parseInt(buildings.meterGroups[i].meters[j].id),
              )
            ) {
              if (!meterIdTable.some(checkDupMeter)) {
                meterIdTable.push(meterObject);
              } else {
                let foundMeterGroups = meterIdTable.find(checkDupMeter);
                /*
                foundMeterGroups.meterGroupString.push(
                  buildings.meterGroups[i].name +
                    " (ID: " +
                    buildings.meterGroups[i].id +
                    ")",
                );
                */
              }
            }

            // If any meters from allBuildings API call are also found in blacklist.json, there is a match
            // There may be some meters from blacklist.json that are not in allBuildings API call, which is intended.
            // If there is a mismatch between blacklist.json and the SQL database (from which allBuildings is derived),
            // then the SQL database should take precedence.
            let foundMeterObj = blacklistMeterTable.find(
              (o) =>
                o.meter_id === parseInt(buildings.meterGroups[i].meters[j].id),
            );
            if (foundMeterObj) {
              if (!meterIdTable.some(checkDupMeter)) {
                foundMeterObj.meterGroupString = [
                  buildings.meterGroups[i].name +
                    " (ID: " +
                    buildings.meterGroups[i].id +
                    ")",
                ];
                foundMeterObj.buildingHiddenText = building_hidden_text;
                foundMeterObj.point_string = meterObject.point_name;
                // finalMissedBuildingTable.push(foundMeterObj);
              } else {
                let foundBlacklistMeterGroups =
                  finalMissedBuildingTable.find(checkDupMeter);
                foundBlacklistMeterGroups.meterGroupString.push(
                  buildings.meterGroups[i].name +
                    " (ID: " +
                    buildings.meterGroups[i].id +
                    ")",
                );
              }
            }
          }
        }

        for (let i = 0; i < finalMissedBuildingTable.length; i++) {
          /*
          missedBuildings.push(
            `${
              finalMissedBuildingTable[i].building_name +
              finalMissedBuildingTable[i].buildingHiddenText
            } (Building ID ${finalMissedBuildingTable[i].building_id}, ${
              finalMissedBuildingTable[i].point_string
            }, Meter ID ${
              finalMissedBuildingTable[i].meter_id
            }, Meter Groups [${
              finalMissedBuildingTable[i].meterGroupString
            }]): ${finalMissedBuildingTable[i].meter_note}`,
          );
          */
        }

        return meterIdTable.map((meterObj) => {
          return new Promise((resolve, reject) => {
            for (let i = 0; i < meterObj.points.length; i++) {
              const options = {
                hostname: "api.sustainability.oregonstate.edu",
                path: `/v2/energy/data?id=${meterObj.id}&startDate=${startDate}&endDate=${endDate}&point=${meterObj.points[i].value}&meterClass=${meterObj.class}`,
                method: "GET",
              };
              console.log(options.path);
              const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                  data += chunk;
                });
                res.on("end", () => {
                  const parsedData = JSON.parse(data);
                  const building_name = buildings.name;
                  const buildingID = buildings.id;
                  const lastObjectIndex = parsedData.length - 1;

                  if (parsedData.length > 0) {
                    const timeValues = [];

                    for (const obj of parsedData) {
                      /// timeValues.push(obj.time);
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
                  below should read as "days ago", e.g. "now === 1" means "now vs 1 day ago"
      
                  noChangeData: (now === 1 and 1 === 2 and 2 === 3 and 3 === 4 and 4 === 5 and 5 === 6)
      
                  noChange4or5Data: (now === 1 and 1 === 2 and 2 === 3 and 3 === 4 and 4 !== 5 or 5 !== 6)
      
                  Overall purpose of the if and else if code block below is to track buildings with no change in data,
                  which may be a sign of meter errors (as seen historically for some gas meters)
                  */

                    if (
                      firstKeyValues[
                        findClosestWithIndex(timeValues, moment().unix()).index
                      ] ===
                        firstKeyValues[
                          findClosestWithIndex(
                            timeValues,
                            moment().subtract(1, "days").unix(),
                          ).index
                        ] &&
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
                      moment().diff(moment.unix(parsedData[0].time), "days") <=
                        2
                    ) {
                      buildingOutput = `${
                        building_name + building_hidden_text
                      } (Building ID ${buildingID}, ${
                        meterObj.point_name
                      }, Meter ID ${
                        meterObj.id
                      }, Meter Groups [${meterObj.meterGroupString.join(
                        ", ",
                      )}]): No Change in Data (Old, At Least 6 Days)`;
                      // noChangeData.push(buildingOutput);
                    } else if (
                      firstKeyValues[
                        findClosestWithIndex(timeValues, moment().unix()).index
                      ] ===
                        firstKeyValues[
                          findClosestWithIndex(
                            timeValues,
                            moment().subtract(1, "days").unix(),
                          ).index
                        ] &&
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
                      moment().diff(moment.unix(parsedData[0].time), "days") <=
                        2
                    ) {
                      buildingOutput = `${
                        building_name + building_hidden_text
                      } (Building ID ${buildingID}, ${
                        meterObj.point_name
                      }, Meter ID ${
                        meterObj.id
                      }, Meter Groups [${meterObj.meterGroupString.join(
                        ", ",
                      )}]): No Change in Data (New, 4 or 5 Days)`;
                      // noChange4Or5Data.push(buildingOutput);
                    }

                    // anything that made it to this else block is presumed to have changing and nonzero data
                    else {
                      let firstTime = parsedData[0].time;
                      if (meterObj.point_name === "Solar Panel") {
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
                        timeDifferenceText = `${hours} hour${
                          hours > 1 ? "s" : ""
                        }`;
                      } else {
                        // If 1 day or more, express in days
                        const days = Math.floor(timeDifference / 86400);
                        timeDifferenceText = `${days} day${
                          days > 1 ? "s" : ""
                        }`;
                      }
                      buildingOutput = `${
                        building_name + building_hidden_text
                      } (Building ID ${buildingID}, ${
                        meterObj.point_name
                      }, Meter ID ${
                        meterObj.id
                      }, Meter Groups [${meterObj.meterGroupString.join(
                        ", ",
                      )}]): Data within the past ${timeDifferenceText}`;
                      // totalBuildingData.push(buildingOutput);
                    }
                  }

                  // for meters that are tracked in the database but still return no data
                  else {
                    buildingOutput = `${
                      building_name + building_hidden_text
                    } (Building ID ${buildingID}, ${
                      meterObj.point_name
                    }, Meter ID ${
                      meterObj.id
                    }, Meter Groups [${meterObj.meterGroupString.join(
                      ", ",
                    )}]): No data within the past ${formattedDuration}`;
                    // totalBuildingData.push(buildingOutput);
                  }
                  resolve();
                });
              });
              req.on("error", (error) => {
                console.error(error);
                reject(error);
              });
              req.end();
            }
          });
        });
      });

      Promise.all(requests)
        .then(() => {
          let dataArr = [
            totalBuildingData,
            noChangeData,
            noChange4Or5Data,
            missedBuildings,
          ];
          for (let i = 0; i < dataArr.length; i++) {
            dataArr[i].sort((a, b) => {
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
          }

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
                // noData3Or4.push(data);
              } else if ((unit === "days" || unit === "day") && timeAgo > 4) {
                // noData.push(data);
              } else {
                // hasData.push(data);
              }
            } else {
              // noData.push(data);
            }
          });

          const dataObj = {
            Timestamp: moment.unix(endDate).format("MM-DD-YYYY HH:mm:ss ZZ"),
            "New Buildings with Missing Data (3 or 4 Days)": noData3Or4,
            "Buildings with Missing Data (For a Long Time)": noData,
            "Buildings Currently Not Tracked (Manual Override)":
              missedBuildings,
            "Buildings with No Change in Data (New, 4 or 5 Days)":
              noChange4Or5Data,
            "Buildings with No Change in Data (Old, At Least 6 Days)":
              noChangeData,
            "Buildings with Valid Data": hasData,
          };

          console.log("===============\n");
          console.log(
            Object.keys(dataObj)[0] + ": " + dataObj.Timestamp + ":\n",
          );
          if (noData3Or4.length > 0) {
            console.log(Object.keys(dataObj)[1] + ":\n");
            console.log(noData3Or4);
          }
          if (noData.length > 0) {
            console.log("\n");
            console.log(Object.keys(dataObj)[2] + ":\n");
            console.log(noData);
          }

          if (missedBuildings.length > 0) {
            console.log("\n");
            console.log(Object.keys(dataObj)[3] + ":\n");
            console.log(missedBuildings);
          }

          if (noChange4Or5Data.length > 0) {
            console.log("\n");
            console.log(Object.keys(dataObj)[4] + ":\n");
            console.log(noChange4Or5Data);
          }
          if (noChangeData.length > 0) {
            console.log("\n");
            console.log(Object.keys(dataObj)[5] + ":\n");
            console.log(noChangeData);
          }
          if (hasData.length > 0) {
            console.log("\n");
            console.log(Object.keys(dataObj)[6] + ":\n");
            console.log(hasData);
          }

          let endTime = new Date();
          let timeDiff = endTime - startTime;
          timeDiff /= 1000;
          let seconds = Math.round(timeDiff);
          console.log(seconds + " seconds");

          // Check if a command-line argument or environment variable is set to save output
          if (
            process.argv.includes("--save-output") ||
            process.env.SAVE_OUTPUT === "true"
          ) {
            const { saveOutputToFile } = require("./save-output");
            saveOutputToFile(dataObj, "output.json", "json");
            saveOutputToFile(dataObj, "output.txt", "json");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
        });

      // Do something with the 'requests' array if needed.
    } else {
      console.error("Failed to fetch data from the API.");
    }
  })
  .catch((error) => {
    console.error("An error occurred while fetching data:", error);
  });
