/*
    Filename: collectData.js
    Description: This file runs all the associated web-scrapers & then sends
                 the data to the API endpoint.
*/

require('dotenv').config()

const SunnyWebBox = require('./solar-arrays/readSunnyWebBox')
const TeslaPanels = require('./solar-arrays/readTeslaPanels')

async function Jobs(){
    // Read Sunny Web Box
    /*
    console.log("Reading Sunny Web Box...")
    const SunnyWebBoxReadings = await SunnyWebBox()


    if (SunnyWebBoxReadings['fail'] === undefined){
        // todo: upload to api
        console.log("Read data successfully!")
        console.log(SunnyWebBoxReadings)
    } else {
        // Handle failure
    }
    */

    // Read Tesla Panels
    console.log("Reading Tesla Solar City interface...")
    const TeslaPanelsReadings = await TeslaPanels()
    console.log(TeslaPanelsReadings)

    // add any other future cron job below
}


Jobs()
