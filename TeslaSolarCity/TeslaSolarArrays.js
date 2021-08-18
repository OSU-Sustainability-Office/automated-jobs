/*
    Filename: collectData.js
    Description: This file runs all the associated web-scrapers & then sends
                 the data to the API endpoint.
*/

require('dotenv').config()

const TeslaPanels = require('./readTeslaPanels')
const fs = require('fs')
const axios = require('axios')

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

    await UploadEnergyDashboard(TeslaPanelsReadings)

}

async function UploadEnergyDashboard(MeterData) {
    for (let meter_id of Object.keys(MeterData)){
        if (MeterData[meter_id].length > 0){
            await axios({
                method: 'post',
                url: `${process.env.DASHBOARD_API}/upload`,
                data: {
                    id: 'M' + meter_id.replace(/-/g, 'M'),
                    body: MeterData[meter_id],
                    pwd: process.env.API_PWD,
                    type: 'solar'
                }
            }).then(res => {
                console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}, DATA: ${res.data}`)
                console.log(`uploaded ${meter_id} data to API`)
                
            }).catch(err => {
                console.log(err)
            })
        }
    }
}


Job()
