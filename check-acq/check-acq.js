const https = require("https");
const moment = require("moment");
const validIDs = require("./validIDs.json").buildings;

const startDate = moment().subtract(2, "months").unix();
const endDate = moment().unix();
const formattedStartDate = startDate.toLocaleString();
const formattedEndDate = endDate.toLocaleString();
const duration = moment.duration(endDate - startDate, "seconds");
const formattedDuration = duration.humanize();

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
      point_name: buildings.meter[i].point_name
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
              "minutes"
            );
            buildingOutput = `${building_name} (Building ID ${buildingID}, ${meterObj.point_name}, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
              ", "
            )}): Data within the past ${timeDifference} minutes.`;
            //console.log(buildingOutput);
            totalBuildingData.push(buildingOutput);
          } else {
            buildingOutput = `${building_name} (Building ID ${buildingID}, ${meterObj.point_name}, Meter ID ${meterObj.id}, Meter Group ID ${meter_groupID.join(
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
      const dataWithinDaysMatch = data.match(/Data within the past (\d+) days?/);
      const dataWithinWeeksMatch = data.match(/Data within the past (\d+) weeks?/);
      const dataWithinMonthsMatch = data.match(/Data within the past (\d+) months?/);
      
      if (data.includes("No data within the past") || (dataWithinDaysMatch && parseInt(dataWithinDaysMatch[1]) > 2) || dataWithinWeeksMatch || dataWithinMonthsMatch) {
        noData.push(data);
      } else {
        hasData.push(data);
      }
    });

    const sortedData = [...noData, "", ...hasData].join("\n");

    console.log("All requests completed");
    console.log("Total building data:\n", sortedData);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
