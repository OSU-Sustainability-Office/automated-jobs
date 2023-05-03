const https = require('https');
const moment = require('moment');
const validIDs = require('./validIDs.json').buildings;

const startDate = moment().subtract(2, 'months').unix();
const endDate = moment().unix();

let totalBuildingData = [];
let buildingOutput;

const requests = validIDs.flatMap(buildings => {
  const meterIds = buildings.meter_id;
  return meterIds.map(meterId => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.sustainability.oregonstate.edu',
        path: `/v2/energy/data?id=${meterId}&startDate=${startDate}&endDate=${endDate}&point=accumulated_real&meterClass=48`,
        method: 'GET'
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const parsedData = JSON.parse(data);
          if (parsedData.length > 0) {
            const firstTime = parsedData[0].time;
            const timeDifference = moment().diff(moment.unix(firstTime), 'minutes');
            const buildingName = buildings.buildingName;
            const buildingID = buildings.building_id;
            buildingOutput = `${buildingName} (Building ID ${buildingID}, Meter ID ${meterId}): First time value is ${moment.unix(firstTime).format('YYYY-MM-DD HH:mm:ss')}. Within the past ${timeDifference} minutes.`;
            console.log(buildingOutput);
            totalBuildingData.push(buildingOutput);
          } else {
            const buildingName = buildings.buildingName;
            buildingOutput = `${buildingName} (Building ID ${buildingID}, Meter ID ${meterId}): First time value is ${moment.unix(firstTime).format('YYYY-MM-DD HH:mm:ss')}. Within the past ${timeDifference} minutes.`;
            console.log(buildingOutput);
            totalBuildingData.push(buildingOutput);
          }
          resolve();
        });
      });
      req.on('error', (error) => {
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
      const buildingIDA = parseInt(a.match(/Building ID (\d+)/)[1]);
      const buildingIDB = parseInt(b.match(/Building ID (\d+)/)[1]);
      return buildingIDA - buildingIDB;
    });
    console.log('All requests completed');
    console.log('Total building data:', totalBuildingData);
  })
  .catch((error) => {
    console.error('Error:', error);
  });
