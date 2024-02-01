const https = require("https");
const axios = require("axios");
const moment = require("moment-timezone");
const blacklistMeters = require("./blacklist.json");
const stepSize = 50;
const firstEndDate = moment().unix();
let timeOut = 10000;
let nonMergedFinalData = [];
let mergedFinalData = [];

// refer to local ./allBuildings.json file for a template of incoming data
// Get allBuildings.json file with "node format-allBuildings.js" in terminal
// const allBuildings = require("./allBuildings.json");

// global variable, so used var not let
var not200Counter = 0;

// how many non-200 status codes before quitting
const not200Limit = 100;

let isQuit = false;
const readline = require("readline");
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on("keypress", (str, key) => {
  if (key.name === "q") {
    isQuit = true;
  }
});

async function cleanUp() {
  let totalNoDataPoints = [];
  let totalNoDataPoints3or4Days = [];
  let totalNoChangePoints = [];
  let totalNegPoints = [];
  let totalSomePhasesNegative = [];
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
        if (nonMergedFinalData[i].noDataPoints3or4Days) {
          if (!foundMeter.noDataPoints3or4Days) {
            foundMeter.noDataPoints3or4Days =
              nonMergedFinalData[i].noDataPoints3or4Days;
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
    if (mergedFinalData[i].noDataPoints3or4Days) {
      let tempnoDataPoints3or4Days = mergedFinalData[i].noDataPoints3or4Days;
      delete mergedFinalData[i].noDataPoints3or4Days;
      mergedFinalData[i].noDataPoints3or4Days = tempnoDataPoints3or4Days;
      totalNoDataPoints3or4Days.push(mergedFinalData[i].meter_id);
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
  mergedFinalData.push(
    "Timestamp (approximate): " +
      moment
        .unix(firstEndDate)
        .tz("America/Los_Angeles")
        .format("MM-DD-YYYY hh:mm a") +
      " PST",
  );
  if (
    totalNoDataPoints.length > 0 ||
    totalNoDataPoints3or4Days.length > 0 ||
    totalNoDataPoints3or4Days.length > 0 ||
    totalNegPoints.length > 0 ||
    totalSomePhasesNegative.length > 0
  ) {
    mergedFinalData.push(
      "The lines below are just a summary, refer to corresponding meter_id values in data above for details.",
    );
    mergedFinalData.push(
      "Data above is sorted by meter_id from lowest to highest.",
    );
  }
  if (totalNoDataPoints.length > 0) {
    mergedFinalData.push(
      "Meters with no data: " + totalNoDataPoints.join(", "),
    );
  }
  if (totalNoDataPoints3or4Days.length > 0) {
    mergedFinalData.push(
      "Meters with no data for 3 or 4 days: " +
        totalNoDataPoints3or4Days.join(", "),
    );
  }
  if (totalNoChangePoints.length > 0) {
    mergedFinalData.push(
      "Meters with non-changing data: " + totalNoChangePoints.join(", "),
    );
  }
  if (totalNegPoints.length > 0) {
    mergedFinalData.push(
      "Meters with negative data: " + totalNegPoints.join(", "),
    );
  }
  if (totalSomePhasesNegative.length > 0) {
    mergedFinalData.push(
      "Meters with partially negative phase data (real power, reactive power, or apparent power): " +
        totalSomePhasesNegative.join(", "),
    );
  }
  if (process.argv.includes("--save-output")) {
    const { saveOutputToFile } = require("./save-output");
    if (
      process.argv.includes("--negative") &&
      !process.argv.includes("--nodata") &&
      !process.argv.includes("--nochange")
    ) {
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutputNegative.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutputNegative.txt",
        "json",
      );
      mergedFinalData.push(
        "output saved to mergedFinalDataOutputnegative.json and mergedFinalDataOutputnegative.txt",
      );
    } else if (
      process.argv.includes("--nodata") &&
      !process.argv.includes("--negative") &&
      !process.argv.includes("--nochange")
    ) {
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutputNoData.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutputNoData.txt",
        "json",
      );
      mergedFinalData.push(
        "output saved to mergedFinalDataOutputNoData.json and mergedFinalDataOutputNoData.txt",
      );
    } else if (
      process.argv.includes("--nochange") &&
      !process.argv.includes("--nodata") &&
      !process.argv.includes("--negative")
    ) {
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutputNoChange.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutputNoChange.txt",
        "json",
      );
      mergedFinalData.push(
        "output saved to mergedFinalDataOutputNoChange.json and mergedFinalDataOutputNoChange.txt",
      );
    } else {
      saveOutputToFile(mergedFinalData, "mergedFinalDataOutput.json", "json");
      saveOutputToFile(mergedFinalData, "mergedFinalDataOutput.txt", "json");
      mergedFinalData.push(
        "output saved to mergedFinalDataOutput.json and mergedFinalDataOutput.txt",
      );
    }
  }
}

function batchAllRequests() {
  let requestNum = 0;
  let startIterator = 0;
  let endIterator = stepSize;
  if (startIterator < stepSize) {
    console.log("Acquisuite Data Checker\n");
  }

  // I used setInterval as it seemed the most straightforward way to asynchronously wait for each batch of API
  // requests to complete, in addition to adding a 10 second wait between each batch starting, and also to allow
  // for manually ending the loop early with keyboard press (on "q" in this case) if needed
  // This might be over-engineered, and setTimeouts might be good enough

  // References:
  // setInterval with keyboard input to end loop: https://stackoverflow.com/a/55735588
  // setInterval with for loop and delay: https://stackoverflow.com/a/46680284

  let handleRequests = setInterval(function () {
    if (
      !process.argv.includes("--update-blacklist") &&
      !process.argv.includes("--all-meters")
    ) {
      console.log(
        "Checking for meters from " +
          startIterator +
          " to " +
          endIterator +
          ". Press q to quit (on next iteration).",
      );
    }
    if (isQuit) {
      cleanUp();
      console.log(mergedFinalData);
      clearInterval(handleRequests);
      process.exit();
    } else {
      batchRequest(requestNum, startIterator, endIterator, nonMergedFinalData);
    }
    requestNum += stepSize;
    startIterator += stepSize;
    endIterator += stepSize;
  }, timeOut);
}
batchAllRequests();
function batchRequest(
  requestNum,
  startIterator,
  endIterator,
  nonMergedFinalData,
) {
  // by default, the requests sent to our API use a 2 month timeframe for energy graphs, so I emulated it here
  const startDate = moment().subtract(2, "months").unix();
  //const endDate = moment().subtract(2, "days").unix();
  const endDate = moment().unix();
  const duration = moment.duration(endDate - startDate, "seconds");
  const daysDuration = Math.round(duration.asDays());
  const formattedTotalDuration = `${daysDuration} day${
    daysDuration !== 1 ? "s" : ""
  }`;

  let allExpandedMeters = [];
  let finalBlacklistMeters = [];

  const apiUrl =
    "https://api.sustainability.oregonstate.edu/v2/energy/allbuildings";

  axios
    .get(apiUrl)
    .then((response) => {
      if (response.status === 200) {
        const allBuildings = response.data;

        let allMeters = [];
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
                  buildings.meterGroups[i].name +
                    " (Meter Group ID: " +
                    buildings.meterGroups[i].id +
                    ")",
                ],
                type: buildings.meterGroups[i].meters[j].type,
                class: buildings.meterGroups[i].meters[j].classInt,
                points: buildings.meterGroups[i].meters[j].points,
                building_hidden: buildings.hidden,
              };

              const checkDupMeter = (obj) =>
                obj.meter_id ===
                parseInt(buildings.meterGroups[i].meters[j].id);

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
                  foundMeter.meterGroups.push(
                    buildings.meterGroups[i].name +
                      " (Meter Group ID: " +
                      buildings.meterGroups[i].id +
                      ")",
                  );
                }
              }

              // If any meters from allBuildings API call are also found in blacklist.json, there is a match
              // There may be some meters from blacklist.json that are not in allBuildings API call, which is intended.
              // If there is a mismatch between blacklist.json and the SQL database (from which allBuildings is derived),
              // then the SQL database should take precedence.
              let foundBlacklistMeter = blacklistMeters.find(
                (o) =>
                  o.meter_id ===
                  parseInt(buildings.meterGroups[i].meters[j].id),
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
                    buildings.meterGroups[i].name +
                      " (Meter Group ID: " +
                      buildings.meterGroups[i].id +
                      ")",
                  ];
                  delete foundBlacklistMeter.type;
                  foundBlacklistMeter.type = meterObject.type;
                  delete foundBlacklistMeter.class;
                  foundBlacklistMeter.class = meterObject.class;
                  delete foundBlacklistMeter.building_hidden;
                  foundBlacklistMeter.building_hidden =
                    meterObject.building_hidden;
                  finalBlacklistMeters.push(foundBlacklistMeter);
                } else {
                  let foundBlacklistMeterGroups =
                    finalBlacklistMeters.find(checkDupMeter);
                  foundBlacklistMeterGroups.meterGroups.push(
                    buildings.meterGroups[i].name +
                      " (Meter Group ID: " +
                      buildings.meterGroups[i].id +
                      ")",
                  );
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
          console.log(finalBlacklistMeters);
          let { saveOutputToFile } = require("./save-output");
          saveOutputToFile(finalBlacklistMeters, "blacklist.json", "json");
          console.log("Saved to blacklist.json");
          clearInterval();
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
          console.log(allMeters);
          let { saveOutputToFile } = require("./save-output");
          saveOutputToFile(allMeters, "allMeters.json", "json");
          console.log("Saved to allMeters.json");
          clearInterval();
          process.exit();
        }
        for (let i = 0; i < allMeters.length; i++) {
          for (let j = 0; j < allMeters[i].points.length; j++) {
            // TODO: fix in backend meter classes ("instant" for Gas energy type)
            if (allMeters[i].points[j].value === "instant") {
              allMeters[i].points[j] = {
                label: "Instant",
                value: "instant",
              };
            }
            if (allMeters[i].type !== "Electricity") {
            }
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
              class: allMeters[i].class,
              building_hidden: allMeters[i].building_hidden,
              currentPoint: allMeters[i].points[j].value,
              currentPointLabel: allMeters[i].points[j].label,
            };

            // TODO: fix solar panel logic on backend
            if (
              expandedMeterObject.type === "Solar Panel" &&
              expandedMeterObject.currentPoint !== "energy_change"
            ) {
              continue;
            }
            allExpandedMeters.push(expandedMeterObject);
          }
        }

        if (startIterator > allExpandedMeters.length) {
          isQuit = true;
        }
        let batchedExpandedMeters = allExpandedMeters.slice(
          startIterator,
          endIterator,
        );
        const requests = batchedExpandedMeters.map((batchedMeterObject) => {
          requestNum += 1;
          while (requestNum > startIterator && requestNum < endIterator) {
            return new Promise((resolve, reject) => {
              const options = {
                hostname: "api.sustainability.oregonstate.edu",
                path: `/v2/energy/data?id=${batchedMeterObject.meter_id}&startDate=${startDate}&endDate=${endDate}&point=${batchedMeterObject.currentPoint}&meterClass=${batchedMeterObject.class}`,
                method: "GET",
              };
              const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                  data += chunk;
                });
                res.on("end", () => {
                  let delay200 = 0;
                  // See not200Limit for how many errors will cause script to quit.
                  // See AWS lambda / API gateway documentation, there is default throttling for too many requests that can
                  // cause 502 return code.

                  // I'm not sure how the cooldown on the throttling works, but either lower stepSize or increase
                  // timeout (both variables at top of file), until there are few / no errors. Continuing to ping the API
                  // if there are errors can lead to worse throttling.
                  // Or just wait a few hours when throttling has reduced, and try again.

                  // For now this just skips the meter / point combination if it returns a non-200 status code (see reject below).
                  // Could set up something to retry the request or lower the endIterationConst at some point in the future.

                  if (res.statusCode !== 200) {
                    console.log("Return status code " + res.statusCode);
                    console.log(options.path);
                    console.log(
                      "Press q to quit (if at local terminal), and try lowering stepSize or increasing timeout (especially if status code 502)",
                    );
                    not200Counter += 1;

                    // Add a timeout (same as default timeout bettween iterations) so there's time to see what's happening, for local terminal use
                    delay200 = timeOut;
                    if (not200Counter >= not200Limit) {
                      console.log(
                        `Quitting due to having more than ${not200Limit} errors of status code ${res.statusCode}`,
                      );
                      isQuit = true;
                    }
                    const error = new Error(
                      `Request failed with status code ${res.statusCode}`,
                    );
                    error.statusCode = res.statusCode;

                    // Due to rejecting the request on non-200 status code, whatever comes back from the API will not
                    // make it into the final output (otherwise there may be false negatives for missing data points).
                    reject(error);
                  }
                  setTimeout(() => {
                    const parsedData = JSON.parse(data);
                    if (parsedData.length > 0) {
                      const timeValues = [];

                      for (const obj of parsedData) {
                        timeValues.push(obj.time);
                      }

                      const dataValues = parsedData.map((obj) => {
                        const keys = Object.keys(obj);
                        return keys.length > 0 ? obj[keys[0]] : undefined;
                      });

                      /*
                      the first data point and its timestamp is checked. If the first data point is older than 3 days, it is
                      considered "missing", and anything between 3 and 4 days (259200 to 345600 seconds) is also flagged as
                      "recent" missing data
                      */
                      let timeDifferenceNoData = "";
                      if (dataValues[0] || dataValues[0] === 0) {
                        timeDifferenceNoData = moment().diff(
                          moment.unix(timeValues[0]),
                          "seconds",
                        );
                      }
                      // uncomment for debug (test no data value slightly over 3 days, vs over 4 days)
                      /*
                      if (batchedMeterObject.meter_id === 1) {
                        timeDifferenceNoData = 269200;
                      } else {
                        timeDifferenceNoData = 400000;
                      }
                      */
                      if (timeDifferenceNoData > 259200) {
                        let timeDifferenceNoDataText = "";

                        if (
                          timeDifferenceNoData &&
                          timeDifferenceNoData < 3600
                        ) {
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
                            " (DB value: " +
                            batchedMeterObject.currentPoint +
                            ")" +
                            " (First data point at " +
                            timeDifferenceNoDataText,
                        ];

                        const checkDupMeterAndPoints = (obj) =>
                          obj.meter_id ===
                            parseInt(batchedMeterObject.meter_id) &&
                          obj.currentPoint === batchedMeterObject.currentPoint;

                        if (timeDifferenceNoData <= 345600) {
                          batchedMeterObject.noDataPoints3or4Days = true;
                        }
                        // TODO: handle solar power later by updating energy dashboard backend
                        if (
                          !nonMergedFinalData.some(checkDupMeterAndPoints) &&
                          batchedMeterObject.type !== "Solar Panel"
                        ) {
                          nonMergedFinalData.push(batchedMeterObject);
                        }
                      }

                      if (!timeDifferenceNoData) {
                        batchedMeterObject.noDataPoints = [
                          batchedMeterObject.currentPointLabel +
                            " (DB value: " +
                            batchedMeterObject.currentPoint +
                            ")" +
                            `: No datapoints within the past ${formattedTotalDuration}`,
                        ];

                        const checkDupMeterAndPoints = (obj) =>
                          obj.meter_id ===
                            parseInt(batchedMeterObject.meter_id) &&
                          obj.currentPoint === batchedMeterObject.currentPoint;
                        // TODO: handle solar power later by updating energy dashboard backend
                        if (
                          !nonMergedFinalData.some(checkDupMeterAndPoints) &&
                          batchedMeterObject.type !== "Solar Panel"
                        ) {
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
                          const minutes = Math.floor(
                            timeDifferenceNegative / 60,
                          );
                          timeDifferenceNegativeText = `${minutes} minute${
                            minutes > 1 ? "s" : ""
                          }`;
                        } else if (timeDifferenceNegative < 86400) {
                          // If between 1 hour and 1 day, express in hours
                          const hours = Math.floor(
                            timeDifferenceNegative / 3600,
                          );
                          timeDifferenceNegativeText = `${hours} hour${
                            hours > 1 ? "s" : ""
                          }`;
                        } else {
                          // If 1 day or more, express in days
                          const days = Math.floor(
                            timeDifferenceNegative / 86400,
                          );
                          timeDifferenceNegativeText = `${days} day${
                            days > 1 ? "s" : ""
                          }`;
                        }
                        batchedMeterObject.negPoints = [
                          batchedMeterObject.currentPointLabel +
                            " (DB value: " +
                            batchedMeterObject.currentPoint +
                            ")" +
                            ": First negative datapoint at " +
                            timeDifferenceNegativeText,
                        ];
                        const checkDupMeterAndPoints = (obj) =>
                          obj.meter_id ===
                            parseInt(batchedMeterObject.meter_id) &&
                          obj.currentPoint === batchedMeterObject.currentPoint;
                        // TODO: handle solar power later by updating energy dashboard backend
                        if (
                          !nonMergedFinalData.some(checkDupMeterAndPoints) &&
                          batchedMeterObject.type !== "Solar Panel"
                        ) {
                          nonMergedFinalData.push(batchedMeterObject);
                        }
                      }
                      /* 
                      the first data point with a measurement different from the first datapoint is checked. If the timestamp
                      is older than 3 days, it is considered "non-changing". If no data values different from the first
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
                        if (timeDifferenceNoChange > 259200) {
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
                              " (DB value: " +
                              batchedMeterObject.currentPoint +
                              ")" +
                              ": First different datapoint at " +
                              timeDifferenceNoChangeText,
                          ];

                          const checkDupMeterAndPoints = (obj) =>
                            obj.meter_id ===
                              parseInt(batchedMeterObject.meter_id) &&
                            obj.currentPoint ===
                              batchedMeterObject.currentPoint;
                          // TODO: handle solar power later by updating energy dashboard backend
                          if (
                            !nonMergedFinalData.some(checkDupMeterAndPoints) &&
                            batchedMeterObject.type !== "Solar Panel"
                          ) {
                            nonMergedFinalData.push(batchedMeterObject);
                          }
                        }
                      } else {
                        batchedMeterObject.noChangePoints = [
                          batchedMeterObject.currentPointLabel +
                            " (DB value: " +
                            batchedMeterObject.currentPoint +
                            ")" +
                            `: No different datapoints within the past ${formattedTotalDuration}`,
                        ];

                        const checkDupMeterAndPoints = (obj) =>
                          obj.meter_id ===
                            parseInt(batchedMeterObject.meter_id) &&
                          obj.currentPoint === batchedMeterObject.currentPoint;
                        // TODO: handle solar power later by updating energy dashboard backend
                        if (
                          !nonMergedFinalData.some(checkDupMeterAndPoints) &&
                          batchedMeterObject.type !== "Solar Panel"
                        ) {
                          nonMergedFinalData.push(batchedMeterObject);
                        }
                      }
                    }

                    // for meters that are tracked in the database but still return no data
                    else {
                      batchedMeterObject.noDataPoints = [
                        batchedMeterObject.currentPointLabel +
                          " (DB value: " +
                          batchedMeterObject.currentPoint +
                          ")" +
                          `: No datapoints within the past ${formattedTotalDuration}`,
                      ];

                      const checkDupMeterAndPoints = (obj) =>
                        obj.meter_id ===
                          parseInt(batchedMeterObject.meter_id) &&
                        obj.currentPoint === batchedMeterObject.currentPoint;
                      // TODO: handle solar power later by updating energy dashboard backend
                      if (
                        !nonMergedFinalData.some(checkDupMeterAndPoints) &&
                        batchedMeterObject.type !== "Solar Panel"
                      ) {
                        nonMergedFinalData.push(batchedMeterObject);
                      }
                    }
                    resolve();
                  }, delay200);
                });
              });
              req.on("error", (error) => {
                console.error(error);
                reject(error);
              });
              req.end();
            });
          }
        });

        Promise.all(requests)
          .then(() => {
            // uncomment for debug
            // console.log(nonMergedFinalData);
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
}
