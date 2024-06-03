const https = require("https");
const axios = require("axios");
const moment = require("moment-timezone");
const blacklistMeters = require("./blacklist.json"); // to update (also check README): node check-acq.js --update-blacklist
let finalBlacklistMeters = [];

const promises = []; // for batching promises.all() - https://stackoverflow.com/a/48737039
let batchSize = 50;
let timeOut = 10000;
let not200Counter = 0;
const not200Limit = 100; // how many non-200 status codes before quitting
let batchedErrorCount = 0;

let allMeters = []; // for each meter > for each point > separate object
let allExpandedMeters = []; // combine data from multiple points into one object, for each meter
let nonMergedFinalData = []; // [Added negative / nochange / nodata points] for each meter > for each point > separate object
let mergedFinalData = []; // [Added negative / nochange / nodata points] combine data from multiple points into one object, for each meter
let outputLogs = [];
let mergedFinalDataLogs = [];
let batchIterations = 0;
let non200Arr = [];

const startDate = moment().subtract(2, "months").unix(); // Energy Dashboard frontend uses 2 months timeframe by default for its API calls
const endDate = moment().unix();
const duration = moment.duration(endDate - startDate, "seconds");
const daysDuration = Math.round(duration.asDays());
const formattedTotalDuration = `${daysDuration} day${
  daysDuration !== 1 ? "s" : ""
}`;

// List of meter IDs for summary logs
let totalNoDataPoints = [];
let totalNoDataPointsRecent = [];
let totalNoChangePoints = [];
let totalNegPoints = [];
let totalSomePhasesNegative = [];

// refer to local ./allBuildings.json file for a template of incoming data
// Get allBuildings.json file with "node format-allBuildings.js" in terminal
// const allBuildings = require("./allBuildings.json");

if (batchIterations === 0) {
  console.log("Acquisuite Data Checker\n");
}

const apiUrl =
  "https://api.sustainability.oregonstate.edu/v2/energy/allbuildings";

axios
  .get(apiUrl)
  .then((response) => {
    // Remember, this status check is for allBuildings API call, not the batched requests
    if (response.status === 200) {
      const allBuildings = response.data;

      for (let i = 0; i < allBuildings.length; i++) {
        let buildings = allBuildings[i];

        const meterGroupLength = buildings.meterGroups.length;
        for (let i = 0; i < meterGroupLength; i++) {
          // skip buildings with null meter groups
          if (buildings.meterGroups[i].id === "null") {
            continue;
          }
          const meterLength = buildings.meterGroups[i].meters.length;

          for (let j = 0; j < meterLength; j++) {
            // skip buildings with null meters
            if (buildings.meterGroups[i].meters[j].id === "null") {
              continue;
            }

            let meterObject = {
              meter_id: parseInt(buildings.meterGroups[i].meters[j].id),
              meter_name: buildings.meterGroups[i].meters[j].name,
              building_id: parseInt(buildings.id),
              building_name: buildings.name,
              meterGroups: [
                {
                  meter_group_id: buildings.meterGroups[i].id,
                  meter_group_name: buildings.meterGroups[i].name,
                },
              ],
              type: buildings.meterGroups[i].meters[j].type,
              classInt: buildings.meterGroups[i].meters[j].classInt,
              points: buildings.meterGroups[i].meters[j].points,
              building_hidden: buildings.hidden,
            };

            const checkDupMeter = (obj) =>
              obj.meter_id === parseInt(buildings.meterGroups[i].meters[j].id);

            let blacklistMeterIDs = blacklistMeters.map((a) => a.meter_id);

            if (
              !blacklistMeterIDs.includes(
                parseInt(buildings.meterGroups[i].meters[j].id),
              )
            ) {
              if (!allMeters.some(checkDupMeter)) {
                allMeters.push(meterObject);
              } else {
                let foundMeter = allMeters.find(checkDupMeter);
                foundMeter.meterGroups.push({
                  meter_group_id: buildings.meterGroups[i].id,
                  meter_group_name: buildings.meterGroups[i].name,
                });
              }
            }

            // If any meters from allBuildings API call are also found in blacklist.json, there is a match
            // There may be some meters from blacklist.json that are not in allBuildings API call, which is intended.
            // If there is a mismatch between blacklist.json and the SQL database (from which allBuildings is derived),
            // then the SQL database should take precedence.
            let foundBlacklistMeter = blacklistMeters.find(
              (o) =>
                o.meter_id === parseInt(buildings.meterGroups[i].meters[j].id),
            );
            if (foundBlacklistMeter) {
              if (!allMeters.some(checkDupMeter)) {
                delete foundBlacklistMeter.meter_name;
                foundBlacklistMeter.meter_name = meterObject.meter_name;
                delete foundBlacklistMeter.building_id;
                foundBlacklistMeter.building_id = meterObject.building_id;
                delete foundBlacklistMeter.building_name;
                foundBlacklistMeter.building_name = meterObject.building_name;
                delete foundBlacklistMeter.meterGroups;
                foundBlacklistMeter.meterGroups = [
                  {
                    meter_group_id: buildings.meterGroups[i].id,
                    meter_group_name: buildings.meterGroups[i].name,
                  },
                ];
                delete foundBlacklistMeter.type;
                foundBlacklistMeter.type = meterObject.type;
                delete foundBlacklistMeter.classInt;
                foundBlacklistMeter.classInt = meterObject.classInt;
                delete foundBlacklistMeter.building_hidden;
                foundBlacklistMeter.building_hidden =
                  meterObject.building_hidden;
                finalBlacklistMeters.push(foundBlacklistMeter);
              } else {
                let foundBlacklistMeterGroups =
                  finalBlacklistMeters.find(checkDupMeter);
                foundBlacklistMeterGroups.meterGroups.push({
                  meter_group_id: buildings.meterGroups[i].id,
                  meter_group_name: buildings.meterGroups[i].name,
                });
              }
            }
          }
        }
      }
      // Sort by building id, then meter id
      finalBlacklistMeters.sort((a, b) => {
        if (a.building_id === b.building_id) {
          return a.meter_id - b.meter_id;
        } else {
          return a.building_id - b.building_id;
        }
      });
      if (process.argv.includes("--update-blacklist")) {
        // log each item in array to console, to prevent nested arrays of objects from being shown as [Object]
        for (let i = 0; i < finalBlacklistMeters.length; i++) {
          console.log(finalBlacklistMeters[i]);
        }
        let { saveOutputToFile } = require("./save-output");
        saveOutputToFile(finalBlacklistMeters, "blacklist.json", "json");
        console.log("Saved to blacklist.json");
        process.exit();
      }
      // Sort by building id, then meter id
      allMeters.sort((a, b) => {
        if (a.building_id === b.building_id) {
          return a.meter_id - b.meter_id;
        } else {
          return a.building_id - b.building_id;
        }
      });
      if (process.argv.includes("--all-meters")) {
        // log each item in array to console, to prevent nested arrays of objects from being shown as [Object]
        for (let i = 0; i < allMeters.length; i++) {
          console.log(allMeters[i]);
        }
        let { saveOutputToFile } = require("./save-output");
        saveOutputToFile(allMeters, "allMeters.json", "json");
        console.log("Saved to allMeters.json");
        process.exit();
      }
      for (let i = 0; i < allMeters.length; i++) {
        for (let j = 0; j < allMeters[i].points.length; j++) {
          if (allMeters[i].points[j] === undefined) {
            console.log("undefined point");
            console.log(j);
            console.log(allMeters[i]);
            continue;
          }

          let expandedMeterObject = {
            meter_id: parseInt(allMeters[i].meter_id),
            meter_name: allMeters[i].meter_name,
            building_id: allMeters[i].building_id,
            building_name: allMeters[i].building_name,
            meterGroups: allMeters[i].meterGroups,
            type: allMeters[i].type,
            classInt: allMeters[i].classInt,
            building_hidden: allMeters[i].building_hidden,
            currentPoint: allMeters[i].points[j].value,
            currentPointLabel: allMeters[i].points[j].label,
          };
          allExpandedMeters.push(expandedMeterObject);
        }
      }

      // make meter object smaller for debug
      // let testExpandedMeters = allExpandedMeters.slice(0, 100);
      function batchRequest(batchedMeterObject) {
        return new Promise((resolve, reject) => {
          process.nextTick(() => {
            const options = {
              hostname: "api.sustainability.oregonstate.edu",
              path: `/v2/energy/data?id=${batchedMeterObject.meter_id}&startDate=${startDate}&endDate=${endDate}&point=${batchedMeterObject.currentPoint}&meterClass=${batchedMeterObject.classInt}`,
              method: "GET",
            };
            const req = https.request(options, (res) => {
              let data = "";
              res.on("data", (chunk) => {
                data += chunk;
              });
              res.on("end", () => {
                // See not200Limit for how many errors will cause script to quit.
                // See AWS lambda / API gateway documentation, there is default throttling for too many requests that can
                // cause 502 return code.

                // I'm not sure how the cooldown on the throttling works, but either lower batchSize or increase
                // timeout (both variables at top of file), until there are few / no errors. Continuing to ping the API
                // if there are errors can lead to worse throttling.
                // Or just wait a few hours when throttling has reduced, and try again.

                // For now this just skips the meter / point combination if it returns a non-200 status code (see reject below).
                // Could set up something to retry the request or lower the batchSize at some point in the future.
                if (res.statusCode !== 200) {
                  console.log(
                    "Status code " + res.statusCode + " for: " + options.path,
                  );
                  if (!(batchedMeterObject.meter_id in non200Arr)) {
                    non200Arr.push(batchedMeterObject.meter_id);
                  }
                  non200Arr = [...new Set(non200Arr)].sort();
                  not200Counter += 1;
                  batchedErrorCount += 1;
                  const singleNon200Error =
                    "Try lowering batchSize or increasing timeout (especially if status code 502). Or, wait a few hours for AWS Lambda throttling to reduce.";

                  reject(singleNon200Error);

                  // Due to rejecting the request on non-200 status code, whatever comes back from the API should not
                  // make it into the output (otherwise there may be false negatives for missing data points).
                } else {
                  const parsedData = JSON.parse(data);
                  if (parsedData.length > 0) {
                    const timeValues = [];

                    // 7 days (604800 seconds) minimum cutoff for "missing data" / "nochange data", for Pacific Power meters
                    // 3 days (259200 seconds) minimum cutoff for "missing data" / "nochange data", for all other meters
                    const minDate =
                      batchedMeterObject.classInt === 9990002 ? 604800 : 259200;

                    // 8 days (691200 seconds) minimum cutoff for "missing data" / "nochange data", for Pacific Power meters
                    // 4 days (345600 seconds) minimum cutoff for "missing data" / "nochange data", for all other meters
                    const maxDate =
                      batchedMeterObject.classInt === 9990002 ? 691200 : 345600;

                    for (const obj of parsedData) {
                      timeValues.push(obj.time);
                    }

                    const dataValues = parsedData.map((obj) => {
                      const keys = Object.keys(obj);
                      return keys.length > 0 ? obj[keys[0]] : undefined;
                    });

                    /*
                        The first data point and its timestamp are checked. If the first data point is older than 3 days, it is
                        considered "missing", and anything between 3 and 4 days (259200 to 345600 seconds), or between 7 and 8
                        days for Pacific Power meters (604800 to 691200 seconds) is also flagged as "recent" missing data
                        */
                    let timeDifferenceNoData = "";
                    if (dataValues[0] || dataValues[0] === 0) {
                      timeDifferenceNoData = moment().diff(
                        moment.unix(timeValues[0]),
                        "seconds",
                      );
                    }
                    // uncomment for debug (test "no data value" slightly over 3 days, vs over 4 days)
                    // or test "no data value" slightly over 7 days, vs over 8 days, for Pacific Power meters
                    /*
                        if (batchedMeterObject.meter_id === 1) {
                          timeDifferenceNoData = 269200;
                        } else {
                          timeDifferenceNoData = 400000;
                        }
                        */

                    // uncomment for debug - test pacific power meters
                    /* 
                    if (batchedMeterObject.classInt === 9990002) {
                      console.log(batchedMeterObject);
                      console.log(timeDifferenceNoData); // remember this is given in seconds
                    }
                    */

                    if (timeDifferenceNoData > minDate) {
                      let timeDifferenceNoDataText = "";

                      if (timeDifferenceNoData && timeDifferenceNoData < 3600) {
                        // If less than an hour, express in minutes
                        const minutes = Math.floor(timeDifferenceNoData / 60);
                        timeDifferenceNoDataText = `${minutes} minute${
                          minutes > 1 ? "s" : ""
                        }`;
                      } else if (timeDifferenceNoData < 86400) {
                        // If between 1 hour and 1 day, express in hours
                        const hours = Math.floor(timeDifferenceNoData / 3600);
                        timeDifferenceNoDataText = `${hours} hour${
                          hours > 1 ? "s" : ""
                        }`;
                      } else {
                        // If 1 day or more, express in days
                        const days = Math.floor(timeDifferenceNoData / 86400);
                        timeDifferenceNoDataText = `${days} day${
                          days > 1 ? "s" : ""
                        }`;
                      }

                      // uncomment for debug
                      /*
                          console.log("\n" + batchedMeterObject.meter_id)
                          console.log(dataValues.findIndex(function (el) {
                            return el === dataValues[0];
                          }))
                          console.log(timeDifferenceNoData)
                      */

                      batchedMeterObject.noDataPoints = [
                        batchedMeterObject.currentPointLabel +
                          " (point: " +
                          batchedMeterObject.currentPoint +
                          ")" +
                          " (First data point at " +
                          timeDifferenceNoDataText,
                      ];

                      const checkDupMeterAndPoints = (obj) =>
                        obj.meter_id ===
                          parseInt(batchedMeterObject.meter_id) &&
                        obj.currentPoint === batchedMeterObject.currentPoint;

                      if (timeDifferenceNoData <= maxDate) {
                        batchedMeterObject.noDataPointsRecent = true;
                      }
                      if (!nonMergedFinalData.some(checkDupMeterAndPoints)) {
                        nonMergedFinalData.push(batchedMeterObject);
                      }
                    }

                    if (!timeDifferenceNoData) {
                      batchedMeterObject.noDataPoints = [
                        batchedMeterObject.currentPointLabel +
                          " (point: " +
                          batchedMeterObject.currentPoint +
                          ")" +
                          `: No datapoints within the past ${formattedTotalDuration}`,
                      ];

                      const checkDupMeterAndPoints = (obj) =>
                        obj.meter_id ===
                          parseInt(batchedMeterObject.meter_id) &&
                        obj.currentPoint === batchedMeterObject.currentPoint;
                      if (!nonMergedFinalData.some(checkDupMeterAndPoints)) {
                        nonMergedFinalData.push(batchedMeterObject);
                      }
                    }

                    /*
                        The first negative data value (no matter how recent) is counted. If no negative values are found, the 
                        meter is assumed to be all values of 0 or greater for the total time period of the previous 2 months
                        */
                    let timeDifferenceNegative = "";

                    timeDifferenceNegative = moment().diff(
                      moment.unix(
                        timeValues[
                          dataValues.findIndex(function (el) {
                            return el < 0;
                          })
                        ],
                      ),
                      "seconds",
                    );

                    // uncomment for debug
                    /*
                          console.log("\n" + batchedMeterObject.meter_id)
                          console.log(dataValues.findIndex(function (el) {
                            return el !== dataValues[0];
                          }))
                          console.log(timeDifferenceNegative)
                        */

                    if (
                      dataValues.findIndex(function (el) {
                        return el < 0;
                      }) !== -1
                    ) {
                      let timeDifferenceNegativeText = "";

                      if (
                        timeDifferenceNegative &&
                        timeDifferenceNegative < 3600
                      ) {
                        // If less than an hour, express in minutes
                        const minutes = Math.floor(timeDifferenceNegative / 60);
                        timeDifferenceNegativeText = `${minutes} minute${
                          minutes > 1 ? "s" : ""
                        }`;
                      } else if (timeDifferenceNegative < 86400) {
                        // If between 1 hour and 1 day, express in hours
                        const hours = Math.floor(timeDifferenceNegative / 3600);
                        timeDifferenceNegativeText = `${hours} hour${
                          hours > 1 ? "s" : ""
                        }`;
                      } else {
                        // If 1 day or more, express in days
                        const days = Math.floor(timeDifferenceNegative / 86400);
                        timeDifferenceNegativeText = `${days} day${
                          days > 1 ? "s" : ""
                        }`;
                      }
                      batchedMeterObject.negPoints = [
                        batchedMeterObject.currentPointLabel +
                          " (point: " +
                          batchedMeterObject.currentPoint +
                          ")" +
                          ": First negative datapoint at " +
                          timeDifferenceNegativeText,
                      ];
                      const checkDupMeterAndPoints = (obj) =>
                        obj.meter_id ===
                          parseInt(batchedMeterObject.meter_id) &&
                        obj.currentPoint === batchedMeterObject.currentPoint;
                      if (!nonMergedFinalData.some(checkDupMeterAndPoints)) {
                        nonMergedFinalData.push(batchedMeterObject);
                      }
                    }
                    /* 
                        the first data point with a measurement different from the first datapoint is checked. If the timestamp
                        is older than 3 days (or over 7 days for PacificPower meters), it is considered "non-changing". If no data values different from the first
                        datapoint are found, it is assumed the data is identical for the total time period of the previous 2 months
                        */
                    let timeDifferenceNoChange = "";

                    timeDifferenceNoChange = moment().diff(
                      moment.unix(
                        timeValues[
                          dataValues.findIndex(function (el) {
                            return el !== dataValues[0];
                          })
                        ],
                      ),
                      "seconds",
                    );

                    // uncomment for debug
                    /*
                        console.log("\n" + batchedMeterObject.meter_id);
                        console.log(
                          dataValues.findIndex(function (el) {
                            return el !== dataValues[0];
                          }),
                        );
                        console.log(timeDifferenceNoChange);
                        */

                    if (
                      dataValues.findIndex(function (el) {
                        return el !== dataValues[0];
                      }) !== -1
                    ) {
                      if (timeDifferenceNoChange > minDate) {
                        let timeDifferenceNoChangeText = "";

                        if (
                          timeDifferenceNoChange &&
                          timeDifferenceNoChange < 3600
                        ) {
                          // If less than an hour, express in minutes
                          const minutes = Math.floor(
                            timeDifferenceNoChange / 60,
                          );
                          timeDifferenceNoChangeText = `${minutes} minute${
                            minutes > 1 ? "s" : ""
                          }`;
                        } else if (timeDifferenceNoChange < 86400) {
                          // If between 1 hour and 1 day, express in hours
                          const hours = Math.floor(
                            timeDifferenceNoChange / 3600,
                          );
                          timeDifferenceNoChangeText = `${hours} hour${
                            hours > 1 ? "s" : ""
                          }`;
                        } else {
                          // If 1 day or more, express in days
                          const days = Math.floor(
                            timeDifferenceNoChange / 86400,
                          );
                          timeDifferenceNoChangeText = `${days} day${
                            days > 1 ? "s" : ""
                          }`;
                        }

                        batchedMeterObject.noChangePoints = [
                          batchedMeterObject.currentPointLabel +
                            " (point: " +
                            batchedMeterObject.currentPoint +
                            ")" +
                            ": First different datapoint at " +
                            timeDifferenceNoChangeText,
                        ];

                        const checkDupMeterAndPoints = (obj) =>
                          obj.meter_id ===
                            parseInt(batchedMeterObject.meter_id) &&
                          obj.currentPoint === batchedMeterObject.currentPoint;
                        if (!nonMergedFinalData.some(checkDupMeterAndPoints)) {
                          nonMergedFinalData.push(batchedMeterObject);
                        }
                      }
                    } else {
                      batchedMeterObject.noChangePoints = [
                        batchedMeterObject.currentPointLabel +
                          " (point: " +
                          batchedMeterObject.currentPoint +
                          ")" +
                          `: No different datapoints within the past ${formattedTotalDuration}`,
                      ];

                      const checkDupMeterAndPoints = (obj) =>
                        obj.meter_id ===
                          parseInt(batchedMeterObject.meter_id) &&
                        obj.currentPoint === batchedMeterObject.currentPoint;
                      if (!nonMergedFinalData.some(checkDupMeterAndPoints)) {
                        nonMergedFinalData.push(batchedMeterObject);
                      }
                    }
                  } else {
                    // for meters that are tracked in the database but still return no data
                    batchedMeterObject.noDataPoints = [
                      batchedMeterObject.currentPointLabel +
                        " (point: " +
                        batchedMeterObject.currentPoint +
                        ")" +
                        `: No datapoints within the past ${formattedTotalDuration}`,
                    ];

                    const checkDupMeterAndPoints = (obj) =>
                      obj.meter_id === parseInt(batchedMeterObject.meter_id) &&
                      obj.currentPoint === batchedMeterObject.currentPoint;
                    if (!nonMergedFinalData.some(checkDupMeterAndPoints)) {
                      nonMergedFinalData.push(batchedMeterObject);
                    }
                  }
                  resolve(batchedMeterObject);
                }
              });
            });
            req.on("error", (error) => {
              console.error(error);
              // reject(batchedMeterObject);
              // reject(error);
            });
            req.end();
          });
        }).catch((error) => {
          // Show "Error" just once every batch to avoid clogging up cloudwatch error metrics
          if (batchedErrorCount === batchIterations) {
            console.error("Error:", error);
          }
          if (not200Counter >= not200Limit) {
            cleanUp();
            throw new Error(
              `Quitting due to having more than ${not200Limit} non-200 status codes.`,
            );
          }
        });
      }

      // reference for awaiting promises in batches: https://stackoverflow.com/a/48737039
      function batchAllRequests(xs) {
        if (!xs.length) {
          Promise.all(promises)
            .then(() => {
              console.log("Checked all meters");
              cleanUp();
              // uncomment for debug
              // console.log(nonMergedFinalData);
            })
            .catch((error) => {
              console.error("Error:", error);
            });
          return;
        }
        promises.push(xs.splice(0, batchSize).map(batchRequest));
        let startIter = batchSize * batchIterations;
        let endIter = batchSize * (batchIterations + 1);
        batchedErrorCount = batchIterations;

        console.log("Checking meters " + startIter + " to " + endIter);
        batchIterations += 1;
        setTimeout((_) => batchAllRequests(xs), timeOut);
      }
      batchAllRequests(allExpandedMeters);
    } else {
      console.error("Failed to fetch data from the API.");
    }
  })
  .catch((error) => {
    console.error("An error occurred while fetching data:", error);
  });

function cleanUp() {
  for (let i = 0; i < nonMergedFinalData.length; i++) {
    const checkDupMeter = (obj) =>
      obj.meter_id === parseInt(nonMergedFinalData[i].meter_id);

    if (
      process.argv.includes("--negative") &&
      !process.argv.includes("--nodata") &&
      !process.argv.includes("--nochange") &&
      (nonMergedFinalData[i].noDataPoints ||
        nonMergedFinalData[i].noChangePoints)
    ) {
      continue;
    } else if (
      process.argv.includes("--nodata") &&
      !process.argv.includes("--negative") &&
      !process.argv.includes("--nochange") &&
      (nonMergedFinalData[i].negPoints || nonMergedFinalData[i].noChangePoints)
    ) {
      continue;
    } else if (
      process.argv.includes("--nochange") &&
      !process.argv.includes("--nodata") &&
      !process.argv.includes("--negeate") &&
      (nonMergedFinalData[i].noDataPoints || nonMergedFinalData[i].negPoints)
    ) {
      continue;
    } else {
      if (!mergedFinalData.some(checkDupMeter)) {
        delete nonMergedFinalData[i].currentPoint;
        delete nonMergedFinalData[i].currentPointLabel;
        mergedFinalData.push(nonMergedFinalData[i]);
      } else {
        let foundMeter = mergedFinalData.find(checkDupMeter);
        if (nonMergedFinalData[i].negPoints) {
          if (foundMeter.negPoints) {
            let mergedNegPoints = foundMeter.negPoints.concat(
              nonMergedFinalData[i].negPoints,
            );
            // might be overkill but last check for duplicates - https://stackoverflow.com/a/15868720
            foundMeter.negPoints = [...new Set(mergedNegPoints)].sort();
          } else {
            foundMeter.negPoints = nonMergedFinalData[i].negPoints;
          }
        }
        if (nonMergedFinalData[i].noDataPoints) {
          if (foundMeter.noDataPoints) {
            let mergednoDataPoints = foundMeter.noDataPoints.concat(
              nonMergedFinalData[i].noDataPoints,
            );
            foundMeter.noDataPoints = [...new Set(mergednoDataPoints)].sort();
          } else {
            foundMeter.noDataPoints = nonMergedFinalData[i].noDataPoints;
          }
        }
        if (nonMergedFinalData[i].noDataPointsRecent) {
          if (!foundMeter.noDataPointsRecent) {
            foundMeter.noDataPointsRecent =
              nonMergedFinalData[i].noDataPointsRecent;
          }
        }
        if (nonMergedFinalData[i].noChangePoints) {
          if (foundMeter.noChangePoints) {
            let mergednoChangePoints = foundMeter.noChangePoints.concat(
              nonMergedFinalData[i].noChangePoints,
            );
            foundMeter.noChangePoints = [
              ...new Set(mergednoChangePoints),
            ].sort();
          } else {
            foundMeter.noChangePoints = nonMergedFinalData[i].noChangePoints;
          }
        }
      }
    }
  }
  // Sort by meter id
  mergedFinalData.sort((a, b) => {
    return a.meter_id - b.meter_id;
  });
  for (let i = 0; i < mergedFinalData.length; i++) {
    let real_power_count = 0;
    let reactive_power_count = 0;
    let apparent_power_count = 0;

    // reordering elements in array of objects for consistency
    if (mergedFinalData[i].noDataPoints) {
      let tempnoDataPoints = mergedFinalData[i].noDataPoints;
      delete mergedFinalData[i].noDataPoints;
      mergedFinalData[i].noDataPoints = tempnoDataPoints;
      totalNoDataPoints.push(mergedFinalData[i].meter_id);
    }
    if (mergedFinalData[i].noDataPointsRecent) {
      let tempnoDataPointsRecent = mergedFinalData[i].noDataPointsRecent;
      delete mergedFinalData[i].noDataPointsRecent;
      mergedFinalData[i].noDataPointsRecent = tempnoDataPointsRecent;
      totalNoDataPointsRecent.push(mergedFinalData[i].meter_id);
    }
    if (mergedFinalData[i].noChangePoints) {
      let tempNoChangePoints = mergedFinalData[i].noChangePoints;
      delete mergedFinalData[i].noChangePoints;
      mergedFinalData[i].noChangePoints = tempNoChangePoints;
      totalNoChangePoints.push(mergedFinalData[i].meter_id);
    }
    if (mergedFinalData[i].negPoints) {
      let tempNegPoints = mergedFinalData[i].negPoints;
      delete mergedFinalData[i].negPoints;
      mergedFinalData[i].negPoints = tempNegPoints;
      totalNegPoints.push(mergedFinalData[i].meter_id);
      for (let j = 0; j < mergedFinalData[i].negPoints.length; j++) {
        if (
          mergedFinalData[i].negPoints[j].match(/^(.*?)real_a/) ||
          mergedFinalData[i].negPoints[j].match(/^(.*?)real_b/) ||
          mergedFinalData[i].negPoints[j].match(/^(.*?)real_c/)
        ) {
          real_power_count += 1;
        }
        if (
          mergedFinalData[i].negPoints[j].match(/^(.*?)reactive_a/) ||
          mergedFinalData[i].negPoints[j].match(/^(.*?)reactive_b/) ||
          mergedFinalData[i].negPoints[j].match(/^(.*?)reactive_c/)
        ) {
          reactive_power_count += 1;
        }
        if (
          mergedFinalData[i].negPoints[j].match(/^(.*?)apparent_a/) ||
          mergedFinalData[i].negPoints[j].match(/^(.*?)apparent_b/) ||
          mergedFinalData[i].negPoints[j].match(/^(.*?)apparent_c/)
        ) {
          apparent_power_count += 1;
        }
      }
      if (real_power_count > 0 && real_power_count < 3) {
        if (mergedFinalData[i].somePhasesNegative) {
          mergedFinalData[i].somePhasesNegative.push("real power");
        } else {
          mergedFinalData[i].somePhasesNegative = ["real power"];
          totalSomePhasesNegative.push(mergedFinalData[i].meter_id);
        }
      }
      if (reactive_power_count > 0 && reactive_power_count < 3) {
        if (mergedFinalData[i].somePhasesNegative) {
          mergedFinalData[i].somePhasesNegative.push("reactive power");
        } else {
          mergedFinalData[i].somePhasesNegative = ["reactive power"];
          totalSomePhasesNegative.push(mergedFinalData[i].meter_id);
        }
      }
      if (apparent_power_count > 0 && apparent_power_count < 3) {
        if (mergedFinalData[i].somePhasesNegative) {
          mergedFinalData[i].somePhasesNegative.push("apparent power");
        } else {
          mergedFinalData[i].somePhasesNegative = ["apparent power"];
          totalSomePhasesNegative.push(mergedFinalData[i].meter_id);
        }
      }
    }
  }

  // easier to tell where outputLogs starts in mergedFinalDataOutput (if needed)
  outputLogs.push("---");

  // Might be redundant with AWS Cloudwatch logs that also give timestamp, but useful for local
  outputLogs.push(
    "Timestamp (approximate): " +
      moment
        .unix(endDate)
        .tz("America/Los_Angeles")
        .format("MM-DD-YYYY hh:mm a") +
      " PST",
  );
  outputLogs.push(
    'If needed, remember to click "Load More" in Cloudwatch logs when scrolling up, to see all logs',
  );
  if (
    non200Arr.length > 0 ||
    totalNoDataPoints.length > 0 ||
    totalNoDataPointsRecent.length > 0 ||
    totalNoDataPointsRecent.length > 0 ||
    totalNegPoints.length > 0 ||
    totalSomePhasesNegative.length > 0
  ) {
    outputLogs.push(
      "The lines below are just a summary. Refer to data / logs above, based on the corresponding meter_id values, for details (e.g. specific point values).",
    );
    outputLogs.push(
      "If applicable, see the 'minDate' and 'maxDate' values of check-acq.js file for details on date cutoffs.",
    );
  }
  if (non200Arr.length > 0) {
    outputLogs.push(
      "Meters returning non-200 status codes: " + non200Arr.join(", "),
    );
  }
  if (totalNoDataPoints.length > 0) {
    outputLogs.push(
      "Meters with no data (for a long time): " + totalNoDataPoints.join(", "),
    );
  }
  if (totalNoDataPointsRecent.length > 0) {
    outputLogs.push(
      "Meters with no data (recent): " + totalNoDataPointsRecent.join(", "),
    );
  }
  if (totalNoChangePoints.length > 0) {
    outputLogs.push(
      "Meters with non-changing data: " + totalNoChangePoints.join(", "),
    );
  }
  if (totalNegPoints.length > 0) {
    outputLogs.push("Meters with negative data: " + totalNegPoints.join(", "));
  }
  if (totalSomePhasesNegative.length > 0) {
    outputLogs.push(
      "Meters with partially negative phase data (real power, reactive power, or apparent power): " +
        totalSomePhasesNegative.join(", "),
    );
  }

  // console log the final output here so the "saved to file" logs are at the bottom when running locally
  mergedFinalDataLogs = mergedFinalData.concat([...outputLogs]);
  // log each item in array to console, to prevent nested arrays of objects from being shown as [Object]
  for (let i = 0; i < mergedFinalDataLogs.length; i++) {
    console.log(mergedFinalDataLogs[i]);
  }

  if (process.argv.includes("--save-output")) {
    const { saveOutputToFile } = require("./save-output");
    if (
      process.argv.includes("--negative") &&
      !process.argv.includes("--nodata") &&
      !process.argv.includes("--nochange")
    ) {
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutputNegative.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutputNegative.txt",
        "json",
      );
      console.log(
        "output saved to mergedFinalDataOutputnegative.json and mergedFinalDataOutputnegative.txt",
      );
    } else if (
      process.argv.includes("--nodata") &&
      !process.argv.includes("--negative") &&
      !process.argv.includes("--nochange")
    ) {
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutputNoData.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutputNoData.txt",
        "json",
      );
      console.log(
        "output saved to mergedFinalDataOutputNoData.json and mergedFinalDataOutputNoData.txt",
      );
    } else if (
      process.argv.includes("--nochange") &&
      !process.argv.includes("--nodata") &&
      !process.argv.includes("--negative")
    ) {
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutputNoChange.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutputNoChange.txt",
        "json",
      );
      console.log(
        "output saved to mergedFinalDataOutputNoChange.json and mergedFinalDataOutputNoChange.txt",
      );
    } else {
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutput.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalDataLogs,
        "mergedFinalDataOutput.txt",
        "json",
      );
      console.log(
        "output saved to mergedFinalDataOutput.json and mergedFinalDataOutput.txt",
      );
    }
  }
}
// handle Ctrl C - https://stackoverflow.com/questions/22594723/how-does-catching-ctrl-c-works-in-node
process.on("SIGINT", function () {
  cleanUp();
  process.exit();
});
