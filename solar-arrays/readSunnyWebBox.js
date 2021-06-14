/**
    Filename: readSunnyWebBox.js
    Description: automatically reads the solar panels data in the Sunny Web Box
                The "Sunny Web Box" web portal uses some
                weird iframe-based layout to dynamically
                change the page content which makes the
                web-scraping logic a little more drawn out.

**/
const puppeteer = require('puppeteer')
require('dotenv').config()

const TIMEOUT_BUFFER = 2000 
const PAGE_LOAD_TIMEOUT = 30000
const CLICK_OPTIONS = {clickCount: 10, delay: 100}
const MAX_TRIES = 5


// Define constant enum
const RETURN_ENUM = {
    "SUCCESS": 0,
    "LoginCache": 1,
    "AlreadyUsed": 2,
    "KeyboardTypeFail": 3,
    "DeviceItemsNotFound": 4,
    "InsufficientTableItems": 5,
    "HardFail": 6,
}
Object.freeze(RETURN_ENUM)


let browser = null
let READINGS = {}


async function scrapeWebBox() {

    console.log('Accessing solar panel web-page...')

    // Initialize web browser
    browser = await puppeteer.launch({headless: true})
    const page = await browser.newPage()

    page.setDefaultTimeout(PAGE_LOAD_TIMEOUT)

    await page.goto(process.env.SOLAR_ARRAY)

    console.log('Accessing main iframe...')

    const MAIN_IFRAME_SELECTOR = `[name="mainFrame"]`
    await page.waitForSelector(MAIN_IFRAME_SELECTOR)    
    const mainIframe = await page.$(MAIN_IFRAME_SELECTOR)
    const mainIframeDOM = await mainIframe.contentFrame()

    console.log('Accessing login iframe...')

    const LOGIN_IFRAME_SELECTOR = `[name="home"]`
    await mainIframeDOM.waitForSelector(LOGIN_IFRAME_SELECTOR)
    const loginIframe = await mainIframeDOM.$(LOGIN_IFRAME_SELECTOR)
    const loginIframeDOM = await loginIframe.contentFrame()

    // Enter password
    const PASSWORD_SELECTOR = `[name="Password"]`
    await loginIframeDOM.waitForSelector(PASSWORD_SELECTOR)
    await loginIframeDOM.type(PASSWORD_SELECTOR, process.env.SOLAR_ARRAY_PWD)

    // Hit login button
    const LOGIN_BUTTON_SELECTOR = `[name="ButtonLogin"]`
    await loginIframeDOM.waitForSelector(LOGIN_BUTTON_SELECTOR)
    const loginButton = await loginIframeDOM.$(LOGIN_BUTTON_SELECTOR)
    const buttonValue =  await (await loginButton.getProperty('value')).jsonValue()

    // we still click the button even if the value is wrong
    await loginButton.click(CLICK_OPTIONS)
    //await loginIframeDOM.waitForTimeout(TIMEOUT_BUFFER)


    if (buttonValue.toLowerCase() === 'logout'){
        return RETURN_ENUM['LoginCache']
    }

    await page.waitForTimeout(PAGE_LOAD_TIMEOUT)

    console.log('logged in!')

    // Now that we have logged in, Sunny Web Box will let us GET 
    // the HTML table which has the data!

    const DEVICES = {
        'WR5KU020:2007328816':`${process.env.SOLAR_ARRAY}plant_current.htm?DevKey=WR5KU020:2007328816`,
        'WRHV3C84:191203847':`${process.env.SOLAR_ARRAY}plant_devices_devfrm.htm?DevKey=WRHV3C84:191203847`,
        'WRHV3C84:191204384':`${process.env.SOLAR_ARRAY}plant_devices_devfrm.htm?DevKey=WRHV3C84:191204384`,
        'WRHV3C84:191204518':`${process.env.SOLAR_ARRAY}plant_devices_devfrm.htm?DevKey=WRHV3C84:191204518`,
    }
    READINGS = {}

    console.log('Starting data collection...')
    // index for progress
    let index = 1
    for (let [id, url] of Object.entries(DEVICES)){
        console.log(`Reading ${id}'s meter data ${index}/${Object.keys(DEVICES).length} at ${url}`)

        const newTab = await browser.newPage()

        await newTab.goto(url)
        console.log('Page loaded!')

        const DATATABLE_SELECTOR = `table.standard-table tbody tr`
        await newTab.waitForSelector(DATATABLE_SELECTOR)
        console.log('Datatable loaded!')

        const TableElements = await newTab.$$(DATATABLE_SELECTOR)
        const meterReadings = []

        console.log('Adding items...')

        for (let tableRow of TableElements){
            
            const tableItems = await tableRow.$$(`td`)
            if (tableItems.length !== 4){
                return RETURN_ENUM["InsufficientTableItems"]
            }

            const reading = {}
            reading.name = await (await tableItems[1].getProperty('textContent')).jsonValue()
            reading.value = await (await tableItems[2].getProperty('textContent')).jsonValue()
            reading.unit = await (await tableItems[3].getProperty('textContent')).jsonValue()

            meterReadings.push(reading)
        }

        READINGS[id] = meterReadings
        index++
    }

    await browser.close()
    

    return RETURN_ENUM["SUCCESS"]
}


module.exports = async function readSunnyWebBox(){

    // clear out readings
    READINGS = {}

    // keep track of how many times we try to
    // read the data (to prevent infinite loop)
    tries = 0

    while (Object.keys(READINGS).length === 0){

        if (tries > MAX_TRIES){
            return {'fail': true}
        }

        tries++

        let response = await scrapeWebBox()
            .catch(err => {
                console.log(`unforeseen errror
                    ${err}
                 `)
                response = RETURN_ENUM['HardFail']
            })
        
        // close browser
        browser.close().catch(err => {})

        switch (response){
            case RETURN_ENUM['SUCCESS']:
                console.log("Scraper exited successfully")
                break
            case RETURN_ENUM['LoginCache']:
            case RETURN_ENUM['AlreadyUsed']:
            case RETURN_ENUM['KeyboardTypeFail']:
                console.log('Runtime error, will try to run program one more time.')
                READINGS = {}
                break
            case RETURN_ENUM['DeviceItemsNotFound']:
            case RETURN_ENUM['InsufficientTableItems']:
                console.log('Unexpected critical failure, has SunnyWebBox changed its layout?')
                READINGS = {'fail': true}
                break
        }
    }

    return READINGS
}

