const https = require('https');
const moment = require('moment');
const validIDs = require('./validIDs.json').IDs;

const startDate = moment().subtract(2, 'months').unix();
const endDate = moment().unix();

validIDs.forEach(id => {
  const options = {
    hostname: 'api.sustainability.oregonstate.edu',
    path: `/v2/energy/data?id=${id}&startDate=${startDate}&endDate=${endDate}&point=accumulated_real&meterClass=48`,
    method: 'GET'
  };

  const req = https.request(options, (res) => {
    // console.log(`statusCode: ${res.statusCode}`);

    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      const parsedData = JSON.parse(data);

      if (parsedData.length === 0) {
        console.log(`ID ${id}: error: not enough data`);
        return;
      }

      const firstTime = parsedData[0].time;
      const formattedTime = moment.unix(firstTime).format('YYYY-MM-DD HH:mm:ss');
      const timeAgo = moment.unix(firstTime).fromNow();

      console.log(`ID ${id}: ${formattedTime} within ${timeAgo}`);
    });
  });

  req.on('error', (error) => {
    console.error(error);
  });

  req.end();
});
