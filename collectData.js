/*
    Filename: collectData.js
    Description: This file runs all the associated web-scrapers & then sends
                 the data to the API endpoint.
*/

require('dotenv').config()

const SunnyWebBox = require('./solar-arrays/readSunnyWebBox')


async function Jobs(){
    // Read Sunny Web Box
    console.log("Reading Sunny Web Box...")
    const SunnyWebBoxReadings = await SunnyWebBox()


    if (SunnyWebBoxReadings['fail'] === undefined){
        // todo: upload to api
        console.log("Read data successfully!")
        console.log(SunnyWebBoxReadings)
    } else {
        // Handle failure
    }


    // add any other future cron job below
}


Jobs()
