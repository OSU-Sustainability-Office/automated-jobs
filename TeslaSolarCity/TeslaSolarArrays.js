/*
    Filename: collectData.js
    Description: This file runs all the associated web-scrapers & then sends
                 the data to the API endpoint.
*/

require('dotenv').config()

const TeslaPanels = require('./readTeslaPanels')
const fs = require('fs')

async function Job(){
    // Read Tesla Panels
    console.log("Reading Tesla Solar City interface...")
    const TeslaPanelsReadings = await TeslaPanels()
    // Format Data
    Object.keys(TeslaPanelsReadings).map(meter_id => {
        const FormattedReadings = []
        TeslaPanelsReadings[meter_id].map(readings => {
            const reading = {}
            reading['time'] = readings['Timestamp']
            reading['time_seconds'] = Math.floor( (new Date ( readings['Timestamp'] )).getTime() / 1000 )
            reading['current'] = readings['Current']
            reading['voltage'] = readings['Voltage']
            // get rid of the \r for the voltage readings
            if (reading['voltage']) reading['voltage'] = reading['voltage'].replace(/\r/g, '')
            reading['total_energy'] = readings['Lifetime Cumulative Energy (kWh)']
            reading['energy_change'] = readings['Energy In Interval (kWh)']
            FormattedReadings.push(reading)
        })
        TeslaPanelsReadings[meter_id] = FormattedReadings
    })

    console.log(TeslaPanelsReadings)
    // TODO: Upload to API

}

async function UploadEnergyDashboard() {
    
}


Job()
