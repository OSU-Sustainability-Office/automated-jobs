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
    let TeslaPanelsReadings = await TeslaPanels()

    console.log('Formatting Data...')
    // Format Data
    Object.keys(TeslaPanelsReadings).map(meter_id => {
        const FormattedReadings = []
        if (TeslaPanelsReadings[meter_id].length == 0) {
            console.log(`could not retrieve data for ${meter_id}`)
        }
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
            if (readings['Type'] === '"Production"') FormattedReadings.push(reading)
        })

        // Merge Readings from Meters to get solar panel totals
        const ReducedReadings = new Map()
        for (let reading of FormattedReadings) {
            if (ReducedReadings.has(reading['time'])){
                let accumulated_readings = ReducedReadings.get(reading['time'])
                accumulated_readings['current'] = Number(accumulated_readings['current']) + Number(reading['current'])
                accumulated_readings['voltage'] = Number(accumulated_readings['voltage']) + Number(reading['voltage'])
                accumulated_readings['total_energy'] = Number(accumulated_readings['total_energy']) + Number(reading['total_energy'])
                accumulated_readings['energy_change'] = Number(accumulated_readings['energy_change']) + Number(reading['energy_change'])
                ReducedReadings.set(reading['time'], accumulated_readings)
            } else {
                ReducedReadings.set(reading['time'], reading)
            }
        }
        // ReducedReadings -> Array Format
        const FinalReadings = []
        for (let reading of ReducedReadings.values()) {
            FinalReadings.push(reading)
        }
        TeslaPanelsReadings[meter_id] = FinalReadings
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
