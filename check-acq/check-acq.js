const https = require("https");
const axios = require("axios");
const moment = require("moment-timezone");
const blacklist = require("./blacklist.json");
const endIteratorConst = 100;
let timeOut = 10000;
let finalData = [];
let mergedFinalData = [];

let isQuit = false;
const readline = require("readline");
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on("keypress", (str, key) => {
  if (key.name === "q") {
    cleanUp();
    console.log(mergedFinalData);
    isQuit = true;
    process.exit();
  }
});

// refer to local ./allBuildings.json file for a template - node format-allBuildings.js
// const allBuildings = require("./allBuildings.json");

async function cleanUp() {
  for (let i = 0; i < finalData.length; i++) {
    const checkDupMeter = (obj) => obj.id === parseInt(finalData[i].id);

    if (!mergedFinalData.some(checkDupMeter)) {
      delete finalData[i].currentPoint;
      delete finalData[i].pointsValues;
      delete finalData[i].point;
      mergedFinalData.push(finalData[i]);
    } else {
      // console.log(mergedFinalData)
      let foundMeterGroups = mergedFinalData.find(checkDupMeter);
      // console.log("found meter groups")
      // console.log(foundMeterGroups)

      if (foundMeterGroups.negPoints) {
        if (finalData[i].negPoints) {
          let mergedNegPoints = foundMeterGroups.negPoints.concat(
            finalData[i].negPoints,
          );
          // might be overkill but last check for duplicates - https://stackoverflow.com/a/15868720
          foundMeterGroups.negPoints = [...new Set(mergedNegPoints)];
        } else {
          foundMeterGroups.negPoints = finalData[i].negPoints;
        }
      }
      if (foundMeterGroups.missingPoints) {
        if (finalData[i].missingPoints) {
          let mergedmissingPoints = foundMeterGroups.missingPoints.concat(
            finalData[i].missingPoints,
          );
          foundMeterGroups.missingPoints = [...new Set(mergedmissingPoints)];
        } else {
          foundMeterGroups.missingPoints = finalData[i].missingPoints;
        }
      }
      if (foundMeterGroups.noChangePoints) {
        if (finalData[i].noChangePoints) {
          let mergednoChangePoints = foundMeterGroups.noChangePoints.concat(
            finalData[i].noChangePoints,
          );
          foundMeterGroups.noChangePoints = [...new Set(mergednoChangePoints)];
        } else {
          foundMeterGroups.noChangePoints = finalData[i].noChangePoints;
        }
      }
    }
  }
  if (process.argv.includes("--save-output")) {
    if (process.argv.includes("--all-params")) {
      const { saveOutputToFile } = require("./save-output");
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutput-All.json",
        "json",
      );
      saveOutputToFile(
        mergedFinalData,
        "mergedFinalDataOutput-All.txt",
        "json",
      );
    } else {
      const { saveOutputToFile } = require("./save-output");
      saveOutputToFile(mergedFinalData, "mergedFinalDataOutput.json", "json");
      saveOutputToFile(mergedFinalData, "mergedFinalDataOutput.txt", "json");
    }
  }
}

function longForLoop() {
  // let finalData = [];
  let requestNum = 0;
  let startIterator = 0;
  let endIterator = endIteratorConst;
  let handle = setInterval(function () {
    console.log(
      "Checking for meters from " +
        startIterator +
        " to " +
        endIterator +
        ". Press q to quit.",
    );
    if (isQuit) {
      clearInterval(handle);
    } else {
      test(requestNum, startIterator, endIterator, finalData);
    }
    requestNum += endIteratorConst;
    startIterator += endIteratorConst;
    endIterator += endIteratorConst;
  }, timeOut);
}
longForLoop();
function test(requestNum, startIterator, endIterator, finalData) {
  // by default, the requests sent to our API use a 2 month timeframe for energy graphs, so I emulated it here
  const startDate = moment().subtract(2, "months").unix();
  //const endDate = moment().subtract(2, "days").unix();
  const endDate = moment().unix();
  const duration = moment.duration(endDate - startDate, "seconds");
  const daysDuration = Math.round(duration.asDays());
  const formattedDuration = `${daysDuration} day${
    daysDuration !== 1 ? "s" : ""
  }`;

  let totalBuildingData = [];
  let missedBuildings = [];
  let buildingOutput;
  let noChangeData = [];
  let noChange4Or5Data = [];
  let blacklistMeterTable = [];
  let finalMeterIdTable = [];

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
        let meterIdTable = [];
        for (let i = 0; i < allBuildings.length; i++) {
          let buildings = allBuildings[i];

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
              // skip buildings with null meters
              if (buildings.meterGroups[i].meters[j].id === "null") {
                continue;
              }
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
                pointsValues: buildings.meterGroups[i].meters[j].points.reduce(
                  (obj, item) =>
                    Object.assign(obj, { [item.label]: item.value }),
                  {},
                ),
                meterGroupString: [
                  buildings.meterGroups[i].name +
                    " (ID: " +
                    buildings.meterGroups[i].id +
                    ")",
                ],
                point_name: buildings.meterGroups[i].meters[j].type,
                buildingName: buildings.name,
                buildingId: buildings.id,
                buildingHiddenText: buildings.hidden,
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
                  foundMeterGroups.meterGroupString.push(
                    buildings.meterGroups[i].name +
                      " (ID: " +
                      buildings.meterGroups[i].id +
                      ")",
                  );
                }
              }

              // If any meters from allBuildings API call are also found in blacklist.json, there is a match
              // There may be some meters from blacklist.json that are not in allBuildings API call, which is intended.
              // If there is a mismatch between blacklist.json and the SQL database (from which allBuildings is derived),
              // then the SQL database should take precedence.
              let foundMeterObj = blacklistMeterTable.find(
                (o) =>
                  o.meter_id ===
                  parseInt(buildings.meterGroups[i].meters[j].id),
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
                  finalMissedBuildingTable.push(foundMeterObj);
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
          }
        }
        for (let i = 0; i < meterIdTable.length; i++) {
          // console.log(finalMeterObj)
          // if (Object.keys(meterIdTable[i].pointsValues)) {
          for (let j = 0; j < meterIdTable[i].points.length; j++) {
            // TODO: fix in backend meter classes
            // console.log(meterIdTable[i].points[j])
            if (meterIdTable[i].points[j].value === "instant") {
              // console.log('helloo')
              meterIdTable[i].points[j] = {
                label: "Instant",
                value: "instant",
              };
              //  console.log(meterIdTable[i].points[j])
            }
            if (meterIdTable[i].point_name !== "Electricity") {
              // console.log(meterIdTable[i].points[j].label)
              // console.log(meterIdTable[i].points[j].value)
            }
            if (meterIdTable[i].points[j] === undefined) {
              console.log("undefined point");
              console.log(j);
              console.log(meterIdTable[i]);
              continue;
            }

            let finalMeterObj = {
              id: parseInt(meterIdTable[i].id),
              class: meterIdTable[i].class,
              point: meterIdTable[i].point,
              pointsValues: meterIdTable[i].pointsValues,
              meterGroupString: meterIdTable[i].meterGroupString,
              point_name: meterIdTable[i].point_name,
              buildingName: meterIdTable[i].buildingName,
              buildingHiddenText: meterIdTable[i].buildingHiddenText,
              currentPoint: meterIdTable[i].points[j].value,
              currentPointLabel: meterIdTable[i].points[j].label,
            };
            /*
            if (finalMeterObj.buildingHiddenText === true) {
              continue;
            }
            */
            // TODO: fix solar panel logic on backend
            if (
              finalMeterObj.point_name === "Solar Panel" &&
              finalMeterObj.currentPoint !== "energy_change"
            ) {
              continue;
            }
            finalMeterIdTable.push(finalMeterObj);
          }
          //  }
        }

        // console.log(finalMeterIdTable)

        if (startIterator > finalMeterIdTable.length) {
          cleanUp();
          console.log(mergedFinalData);
          isQuit = true;
          process.exit();
        }
        let someMeterIdTable = finalMeterIdTable.slice(
          startIterator,
          endIterator,
        );
        // console.log(someMeterIdTable)
        /*
        if (
          process.argv.includes("--save-output")
        ) {
          const { saveOutputToFile } = require("./save-output");
          saveOutputToFile(
            finalMeterIdTable,
            "finalmetertableoutput.json",
            "json",
          );
          saveOutputToFile(
            finalMeterIdTable,
            "finalmetertableoutput.txt",
            "json",
          );
        }
*/
        const requests = someMeterIdTable.map((meterObj) => {
          /*
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
            // skip buildings with null meters
            if (buildings.meterGroups[i].meters[j].id === "null") {
              continue;
            }
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
              pointsValues: buildings.meterGroups[i].meters[j].points.reduce(
                (obj, item) => Object.assign(obj, { [item.label]: item.value }),
                {},
              ),
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
                foundMeterGroups.meterGroupString.push(
                  buildings.meterGroups[i].name +
                    " (ID: " +
                    buildings.meterGroups[i].id +
                    ")",
                );
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
                finalMissedBuildingTable.push(foundMeterObj);
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
        }
        */
          // if (meterIdTable.length > 0) {
          // return meterIdTable.map((meterObj) => {
          //for (let i = 0; i < meterGroupTable.length; i++) {
          requestNum += 1;
          // console.log(requestNum)
          // console.log(startIterator)
          // console.log(endIterator)
          while (requestNum > startIterator && requestNum < endIterator) {
            return new Promise((resolve, reject) => {
              const options = {
                hostname: "api.sustainability.oregonstate.edu",
                path: `/v2/energy/data?id=${meterObj.id}&startDate=${startDate}&endDate=${endDate}&point=${meterObj.currentPoint}&meterClass=${meterObj.class}`,
                method: "GET",
              };
              const req = https.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => {
                  data += chunk;
                });
                res.on("end", () => {
                  let delay200 = 0;
                  if (res.statusCode !== 200) {
                    console.log("Error code " + res.statusCode);
                    console.log(options.path);
                    console.log(
                      "Try lowering endIterator or increasing timeout",
                    );
                    delay200 = timeOut;
                  }
                  setTimeout(() => {
                    const parsedData = JSON.parse(data);
                    // const building_name = buildings.name;
                    // const buildingID = buildings.id;
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
                      below should read as "days ago", e.g. "now === 1" means "now vs 1 day ago"
          
                      noChangeData: (now === 1 and 1 === 2 and 2 === 3 and 3 === 4 and 4 === 5 and 5 === 6)
          
                      noChange4or5Data: (now === 1 and 1 === 2 and 2 === 3 and 3 === 4 and 4 !== 5 or 5 !== 6)
          
                      Overall purpose of the if and else if code block below is to track buildings with no change in data,
                      which may be a sign of meter errors (as seen historically for some gas meters)
                      */

                      /*
                        console.log(
                          firstKeyValues.find(function (el) {
                            return el != firstKeyValues[0];
                          })
                        );
                        console.log(
                          timeValues[
                            findClosestWithIndex(
                              firstKeyValues,
                              firstKeyValues.find(function (el) {
                                return el != firstKeyValues[0];
                              })
                            ).index
                          ]
                        );
                        */

                      let timeDifference1 = "";
                      if (firstKeyValues[0] || firstKeyValues[0] === 0) {
                        timeDifference1 = moment().diff(
                          moment.unix(
                            timeValues[
                              findClosestWithIndex(
                                firstKeyValues,
                                firstKeyValues[0],
                              ).index
                            ],
                          ),
                          "seconds",
                        );
                      }

                      let timeDifferenceText1 = "";

                      if (timeDifference1 && timeDifference1 < 3600) {
                        // If less than an hour, express in minutes
                        const minutes = Math.floor(timeDifference1 / 60);
                        timeDifferenceText1 = `${minutes} minute${
                          minutes > 1 ? "s" : ""
                        }`;
                      } else if (timeDifference1 < 86400) {
                        // If between 1 hour and 1 day, express in hours
                        const hours = Math.floor(timeDifference1 / 3600);
                        timeDifferenceText1 = `${hours} hour${
                          hours > 1 ? "s" : ""
                        }`;
                      } else {
                        // If 1 day or more, express in days
                        const days = Math.floor(timeDifference1 / 86400);
                        timeDifferenceText1 = `${days} day${
                          days > 1 ? "s" : ""
                        }`;
                      }

                      // uncomment for debug
                      /*
                      console.log("\n" + meterObj.id);
                      console.log("first value");
                      console.log(firstKeyValues[0]);
                      console.log(
                        timeValues[
                          findClosestWithIndex(
                            firstKeyValues,
                            firstKeyValues[0],
                          ).index
                        ],
                      );
                      console.log(timeDifference1);
                      console.log(timeDifferenceText1);
                      */

                      if (timeDifference1 > 259200) {
                        // let onevar =  {};
                        // onevar[meterObj.point] = timeDifference1;
                        meterObj.missingPoints = [
                          meterObj.currentPointLabel +
                            " (First data point at: " +
                            timeDifferenceText1,
                        ];

                        const checkDupMeter = (obj) =>
                          obj.id === parseInt(meterObj.id) &&
                          obj.currentPoint === meterObj.currentPoint;
                        // (obj.currentPoint === meterObj.currentPoint)
                        if (
                          !finalData.some(checkDupMeter) &&
                          meterObj.point_name !== "Solar Panel"
                        ) {
                          if (process.argv.includes("--all-params")) {
                            finalData.push(meterObj);
                          }
                        }
                        /*
                          else {
                            let foundFinalData = finalData.find(checkDupMeter);
                            foundFinalData.missingPoints.push(
                              meterObj.currentPoint +
                                " (First data point at " +
                                timeDifferenceText1 +
                                ")",
                            );
                          }
                          */
                      }

                      // TODO: handle solar power later by updating energy dashboard backend
                      if (!timeDifference1 || timeDifference1 === "") {
                        // let onevar =  {};
                        // onevar[meterObj.point] = timeDifference1;
                        meterObj.missingPoints = [
                          meterObj.currentPointLabel +
                            `: No datapoints within the past ${formattedDuration}`,
                        ];

                        const checkDupMeter = (obj) =>
                          obj.id === parseInt(meterObj.id) &&
                          obj.currentPoint === meterObj.currentPoint;
                        // (obj.currentPoint === meterObj.currentPoint)
                        if (
                          !finalData.some(checkDupMeter) &&
                          meterObj.point_name !== "Solar Panel"
                        ) {
                          if (process.argv.includes("--all-params")) {
                            finalData.push(meterObj);
                          }
                        }
                        /*
                          else {
                            let foundFinalData = finalData.find(checkDupMeter);
                            foundFinalData.missingPoints.push(
                              meterObj.currentPoint +
                                " " +
                                `(No datapoints within the past ${formattedDuration})`,
                            );
                          }
                          */
                      }

                      let timeDifference3 = "";
                      /*
                      if (
                        firstKeyValues.find(function (el) {
                          return el >= 0;
                        })
                      ) {
                        */
                      timeDifference3 = moment().diff(
                        moment.unix(
                          timeValues[
                            findClosestWithIndex(
                              firstKeyValues,
                              firstKeyValues.find(function (el) {
                                return el >= 0;
                              }),
                            ).index
                          ],
                        ),
                        "seconds",
                      );

                      if (!timeDifference3 && firstKeyValues[0] >= 0) {
                        timeDifference3 = moment().diff(
                          moment.unix(
                            parsedData[
                              findClosestWithIndex(
                                firstKeyValues,
                                firstKeyValues.find(function (el) {
                                  return el >= 0;
                                }),
                              ).index
                            ],
                          ),
                          "seconds",
                        );
                      } else {
                      }

                      // }

                      let timeDifferenceText3 = "";

                      if (timeDifference3 && timeDifference3 < 3600) {
                        // If less than an hour, express in minutes
                        const minutes = Math.floor(timeDifference3 / 60);
                        timeDifferenceText3 = `${minutes} minute${
                          minutes > 1 ? "s" : ""
                        }`;
                      } else if (timeDifference3 < 86400) {
                        // If between 1 hour and 1 day, express in hours
                        const hours = Math.floor(timeDifference3 / 3600);
                        timeDifferenceText3 = `${hours} hour${
                          hours > 1 ? "s" : ""
                        }`;
                      } else {
                        // If 1 day or more, express in days
                        const days = Math.floor(timeDifference3 / 86400);
                        timeDifferenceText3 = `${days} day${
                          days > 1 ? "s" : ""
                        }`;
                      }

                      //uncomment for debug
                      /*
                      console.log("\n" + meterObj.id);
                      console.log(meterObj.point_name);
                      console.log(meterObj.currentPoint);
                      console.log("positive value first time");
                      console.log(
                        firstKeyValues.find(function (el) {
                          return el >= 0;
                        }),
                      );
                      console.log(
                        findClosestWithIndex(
                          firstKeyValues,
                          firstKeyValues.find(function (el) {
                            return el >= 0;
                          }),
                        ).index,
                      );
                      console.log(
                        timeValues[
                          findClosestWithIndex(
                            firstKeyValues,
                            firstKeyValues.find(function (el) {
                              return el >= 0;
                            }),
                          ).index
                        ],
                      );
                      console.log(timeDifference3);
                      console.log(timeDifferenceText3);
                      */

                      if (timeDifference3 > 259200) {
                        // let onevar =  {};
                        // onevar[meterObj.point] = timeDifference3;
                        meterObj.negPoints = [
                          meterObj.currentPointLabel +
                            ": First positive datapoint at " +
                            timeDifferenceText3,
                        ];

                        const checkDupMeter = (obj) =>
                          obj.id === parseInt(meterObj.id) &&
                          obj.currentPoint === meterObj.currentPoint;
                        // (obj.currentPoint === meterObj.currentPoint)
                        // TODO: Fix solar panel logic on backend
                        if (
                          !finalData.some(checkDupMeter) &&
                          meterObj.point_name !== "Solar Panel"
                        ) {
                          finalData.push(meterObj);
                        }
                      }
                      /*
                          else {
                            let foundFinalData = finalData.find(checkDupMeter);
                            foundFinalData.negPoints.push(
                              meterObj.currentPoint +
                                " (First positive datapoint at " +
                                timeDifferenceText3 +
                                ")",
                            );
                          }
                          */

                      // TODO: handle solar power later by updating energy dashboard backend
                      if (
                        !firstKeyValues.find(function (el) {
                          return el >= 0;
                        })
                      ) {
                        // let onevar =  {};
                        // onevar[meterObj.point] = timeDifference3;
                        meterObj.negPoints = [
                          meterObj.currentPointLabel +
                            `: No positive datapoints within the past ${formattedDuration}`,
                        ];

                        const checkDupMeter = (obj) =>
                          obj.id === parseInt(meterObj.id) &&
                          obj.currentPoint === meterObj.currentPoint;

                        // (obj.currentPoint === meterObj.currentPoint)
                        // TODO: Fix solar panel logic on backend
                        if (
                          !finalData.some(checkDupMeter) &&
                          meterObj.point_name !== "Solar Panel"
                        ) {
                          finalData.push(meterObj);
                        }
                        /*
                          else {
                            let foundFinalData = finalData.find(checkDupMeter);
                            foundFinalData.negPoints.push(
                              meterObj.currentPoint +
                                " " +
                                `(No positive datapoints within the past ${formattedDuration})`,
                            );
                          }
                          */
                      }
                      /*
                      const isBelowThreshold = (currentValue) =>
                        currentValue === firstKeyValues[0];
                        */
                      let timeDifference2 = "";
                      timeDifference2 = moment().diff(
                        moment.unix(
                          timeValues[
                            findClosestWithIndex(
                              firstKeyValues,
                              firstKeyValues.find(function (el) {
                                return el != firstKeyValues[0];
                              }),
                            ).index
                          ],
                        ),
                        "seconds",
                      );

                      let timeDifferenceText2 = "";

                      if (timeDifference2 && timeDifference2 < 3600) {
                        // If less than an hour, express in minutes
                        const minutes = Math.floor(timeDifference2 / 60);
                        timeDifferenceText2 = `${minutes} minute${
                          minutes > 1 ? "s" : ""
                        }`;
                      } else if (timeDifference2 < 86400) {
                        // If between 1 hour and 1 day, express in hours
                        const hours = Math.floor(timeDifference2 / 3600);
                        timeDifferenceText2 = `${hours} hour${
                          hours > 1 ? "s" : ""
                        }`;
                      } else {
                        // If 1 day or more, express in days
                        const days = Math.floor(timeDifference2 / 86400);
                        timeDifferenceText2 = `${days} day${
                          days > 1 ? "s" : ""
                        }`;
                      }

                      // uncomment for debug
                      /*
                      console.log("\n" + meterObj.id);
                      console.log("first different value");
                      console.log(
                        firstKeyValues.find(function (el) {
                          return el != firstKeyValues[0];
                        }),
                      );
                      console.log(
                        timeValues[
                          findClosestWithIndex(
                            firstKeyValues,
                            firstKeyValues.find(function (el) {
                              return el != firstKeyValues[0];
                            }),
                          ).index
                        ],
                      );
                      console.log(timeDifference2);
                      console.log(timeDifferenceText2);
                      */

                      if (timeDifference2 > 259200) {
                        // let onevar =  {};
                        // onevar[meterObj.point] = timeDifference2;
                        meterObj.noChangePoints = [
                          meterObj.currentPointLabel +
                            ": First different datapoint at " +
                            timeDifferenceText2,
                        ];

                        const checkDupMeter = (obj) =>
                          obj.id === parseInt(meterObj.id) &&
                          obj.currentPoint === meterObj.currentPoint;
                        // (obj.currentPoint === meterObj.currentPoint)
                        if (
                          !finalData.some(checkDupMeter) &&
                          meterObj.point_name !== "Solar Panel"
                        ) {
                          if (process.argv.includes("--all-params")) {
                            finalData.push(meterObj);
                          }
                        }
                        /*
                          else {
                            let foundFinalData = finalData.find(checkDupMeter);
                            foundFinalData.noChangePoints.push(
                              meterObj.currentPoint +
                                " (First different datapoint at " +
                                timeDifferenceText2 +
                                ")",
                            );
                          }
                          */
                      }

                      // TODO: handle solar power later by updating energy dashboard backend
                      if (
                        !firstKeyValues.find(function (el) {
                          return el != firstKeyValues[0];
                        })
                      ) {
                        // let onevar =  {};
                        // onevar[meterObj.point] = timeDifference2;
                        meterObj.noChangePoints = [
                          meterObj.currentPointLabel +
                            `: No different datapoints within the past ${formattedDuration}`,
                        ];

                        const checkDupMeter = (obj) =>
                          obj.id === parseInt(meterObj.id) &&
                          obj.currentPoint === meterObj.currentPoint;
                        // (obj.currentPoint === meterObj.currentPoint)
                        if (
                          !finalData.some(checkDupMeter) &&
                          meterObj.point_name !== "Solar Panel"
                        ) {
                          if (process.argv.includes("--all-params")) {
                            finalData.push(meterObj);
                          }
                        }
                        /*
                          else {
                            let foundFinalData = finalData.find(checkDupMeter);
                            foundFinalData.noChangePoints.push(
                              meterObj.currentPoint +
                                " " +
                                `(No different datapoints within the past ${formattedDuration})`,
                            );
                          }
                          */
                      }
                      /*
                      if (firstKeyValues.every(isBelowThreshold)) {
                        buildingOutput = `${
                          meterObj.buildingName + meterObj.buildingHiddenText
                        } (Building ID ${meterObj.buildingId}, ${
                          meterObj.point_name
                        }, Meter ID ${
                          meterObj.id
                        }, Meter Groups [${meterObj.meterGroupString.join(
                          ", ",
                        )}]): No Change in Data (Old, At Least 6 Days)`;
                        noChangeData.push(buildingOutput);
                      }
                      */
                      /*
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
                          noChangeData.push(buildingOutput);
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
                          noChange4Or5Data.push(buildingOutput);
                        }
                        */

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
                          meterObj.buildingName + meterObj.buildingHiddenText
                        } (Building ID ${meterObj.buildingId}, ${
                          meterObj.point_name
                        }, Meter ID ${
                          meterObj.id
                        }, Meter Groups [${meterObj.meterGroupString.join(
                          ", ",
                        )}]): Data within the past ${timeDifferenceText}`;
                        totalBuildingData.push(buildingOutput);
                      }
                    }

                    // for meters that are tracked in the database but still return no data
                    else {
                      buildingOutput = `${
                        meterObj.buildingName + meterObj.buildingHiddenText
                      } (Building ID ${meterObj.buildingId}, ${
                        meterObj.point_name
                      }, Meter ID ${
                        meterObj.id
                      }, Meter Groups [${meterObj.meterGroupString.join(
                        ", ",
                      )}]): No data within the past ${formattedDuration}`;
                      totalBuildingData.push(buildingOutput);
                      meterObj.missingPoints = [
                        meterObj.currentPointLabel +
                          `: No datapoints within the past ${formattedDuration}`,
                      ];

                      const checkDupMeter = (obj) =>
                        obj.id === parseInt(meterObj.id) &&
                        obj.currentPoint === meterObj.currentPoint;
                      // (obj.currentPoint === meterObj.currentPoint)
                      if (
                        !finalData.some(checkDupMeter) &&
                        meterObj.point_name !== "Solar Panel"
                      ) {
                        if (process.argv.includes("--all-params")) {
                          finalData.push(meterObj);
                        }
                      }
                      /*
                        else {
                          let foundFinalData = finalData.find(checkDupMeter);
                          foundFinalData.missingPoints.push(meterObj.currentPoint);
                        }
                        */
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
          // });
          // }
        });

        Promise.all(requests)
          .then(() => {
            // uncomment for debug
            // console.log(finalData);
            /*
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

          if (noData3Or4.length > 0) {
            console.log("Meter Outages 3 or 4 Days Detected\n");
          }

          if (noData.length > 0) {
            console.log("Meter Outages Detected\n");
          }

          if (noChange4Or5Data.length > 0) {
            console.log("Meters with Unchanging Data 4 or 5 Days Detected\n");
          }

          if (noChangeData.length > 0) {
            console.log("Meters with Unchanging Data Detected\n");
          }

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
          console.log(Object.keys(dataObj)[1] + ":\n");
          console.log(noData3Or4);
          console.log("\n");
          console.log(Object.keys(dataObj)[2] + ":\n");
          console.log(noData);
          console.log("\n");
          console.log(Object.keys(dataObj)[3] + ":\n");
          console.log(missedBuildings);
          console.log("\n");
          console.log(Object.keys(dataObj)[4] + ":\n");
          console.log(noChange4Or5Data);
          console.log("\n");
          console.log(Object.keys(dataObj)[5] + ":\n");
          console.log(noChangeData);
          console.log("\n");
          console.log(Object.keys(dataObj)[6] + ":\n");
          console.log(hasData);

          // Check if a command-line argument or environment variable is set to save output
          if (
            process.argv.includes("--save-output")
          ) {
            const { saveOutputToFile } = require("./save-output");
            saveOutputToFile(dataObj, "output.json", "json");
            saveOutputToFile(dataObj, "output.txt", "json");
          }
          */
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
