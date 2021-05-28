/**
    Filename: readSolarPanel.js
    Description: automatically reads the solar panels data in the Sunny Web Box
                The "Sunny Web Box" web portal uses some
                weird iframe-based layout to dynamically
                change the page content which makes the
                web-scraping logic a little more drawn out.

**/
const puppeteer = require('puppeteer')
require('dotenv').config()


async function readSolarPanels() {

    console.log('Accessing solar panel web-page...')

    // Initialize web browser
    const browser = await puppeteer.launch({headless: false})
    const page = await browser.newPage()
    await page.goto(process.env.SOLAR_ARRAY)

    console.log('Accessing main iframe...')

    const MAIN_IFRAME_SELECTOR = `[name="mainFrame"]`
    await page.waitForSelector(MAIN_IFRAME_SELECTOR)    
    const mainIframe = await page.$(MAIN_IFRAME_SELECTOR)
    const mainIframeDOM = await mainIframe.contentFrame()

    console.log('Accessing login iframe...')

    const LOGIN_IFRAME_SELECTOR = `[name="home"]`
    mainIframeDOM.waitForSelector(LOGIN_IFRAME_SELECTOR)
    const loginIframe = await mainIframeDOM.$(LOGIN_IFRAME_SELECTOR)
    const loginIframeDOM = await loginIframe.contentFrame()


    console.log('Logging in...')

    const LOGIN_SELECTOR = `[name="Password"]`
    await loginIframeDOM.waitForSelector(LOGIN_SELECTOR)
    await loginIframeDOM.type(LOGIN_SELECTOR, process.env.SOLAR_ARRAY_PWD)
    await page.keyboard.down('Tab')
    await page.keyboard.down('Enter')

    // Now check if login worked (may be in use by another user)
    const Message = await loginIframeDOM.content()
    if (Message.includes('already in use')){
        await browser.close()
        return {code: 1, msg: 'Someone is already using the Solar Array Web Interface'}
    } 
    /*
    else if (Message.includes('Login')){
        await browser.close()
        return {code: 2, msg: 'Failed to login due to inconsistent page.keyboard behavior'}
    }
    */
    
    // Now let's read all the solar panels!
    console.log('Accessing device info iframe...')

    const DEVICE_IFRAME_SELECTOR = `[name=plant_devices_devfs]`
    await mainIframeDOM.waitForSelector(DEVICE_IFRAME_SELECTOR)
        .catch(err => {
            return {code: 3, msg: 'Weird glitch where login fails due to Chromium keyboard.type() function being unreliable'}
        })
    const deviceIframe = await mainIframeDOM.$(DEVICE_IFRAME_SELECTOR)
    const deviceIframeDOM = await deviceIframe.contentFrame()

    console.log('Accessing device list iframe...')
    
    const DEVICE_MENU_IFRAME_SELECTOR = `[name="treeframe"]`
    await deviceIframeDOM.waitForSelector(DEVICE_MENU_IFRAME_SELECTOR)
    const deviceMenuIframe = await deviceIframeDOM.$(DEVICE_MENU_IFRAME_SELECTOR)
    const deviceMenuIframeDOM = await deviceMenuIframe.contentFrame()

    console.log('Querying for device list...')

    const DEVICE_LIST_SELECTOR = `td[width="100%"] a[target='devfrm']`
    await deviceMenuIframeDOM.waitForSelector(DEVICE_LIST_SELECTOR)
    const deviceList = await deviceMenuIframeDOM.$$(DEVICE_LIST_SELECTOR)
    
    // check if we could find the elements
    if (deviceList.length <= 1){
        await browser.close()
        return {code: 3, msg: 'Could not find the device items, have they changed the Sunny Web Box layout?'}
    }
    
    // Remove first 'home'-icon element (doesn't reference a device)
    deviceList.shift()

    console.log('Collecting solar panel readings...')

    // For each device element let's read their content
    const READINGS = {}
    let index = 1
    for ( let device of deviceList ){


        // First, get device name
        const deviceName = await (await device.getProperty('textContent')).jsonValue()

        // Let's move to this device's page (iframe)!
        await device.click()

        console.log(`Accessing ${deviceName}'s iframe... ${index}/${deviceList.length} `)

        const DEVICE_INFO_SELECTOR = `[name="devfrm"]`
        await deviceIframeDOM.waitForSelector(DEVICE_INFO_SELECTOR)
        const deviceInfoIframe = await deviceIframeDOM.$(DEVICE_INFO_SELECTOR)
        const deviceInfoIframeDOM = await deviceInfoIframe.contentFrame()


        // Move to "Spot Parameters tab"
        console.log('Moving to the "Spot Values" tab...')

        const DEVICE_DATA_TABS_SELECTOR = `/html/body/form/div[1]/ul/li[2]/a/span`
        

        // TOOD: fix this xpath logic
        await deviceInfoIframeDOM.waitForXPath(DEVICE_DATA_TABS_SELECTOR)
        const deviceDataTabs = await deviceInfoIframeDOM.$x(DEVICE_DATA_TABS_SELECTOR)

        const SpotValuesTabElem = deviceDataTabs[0]
        await SpotValuesTabElem.click()

        console.log('Reading datatable...')

        const DATATABLE_SELECTOR = `table.standard-table tbody tr`
        await deviceInfoIframeDOM.waitForTimeout(10000)
        await deviceInfoIframeDOM.waitForSelector(DATATABLE_SELECTOR)
        const TableElements = await deviceInfoIframeDOM.$$(DATATABLE_SELECTOR)

        // go through children & parse data
        const meterReadings = []

        for (let tableRow of TableElements){
            
            const TABLE_ITEMS_SELECTOR = `td`
            const tableItems = await tableRow.$$(TABLE_ITEMS_SELECTOR)
    

            if (tableItems.length !== 4){
                await browser.close()
                return {code: 6, msg: `Error: Insufficient table items (got ${tableItems.length}, wanted 4) ... has Sunny Web Box changed its layout?`}
            }

            const reading = {}
            
            // Name
            reading.name = await (await tableItems[1].getProperty('textContent')).jsonValue()
            reading.value = await (await tableItems[2].getProperty('textContent')).jsonValue()
            reading.unit = await (await tableItems[3].getProperty('textContent')).jsonValue()

            meterReadings.push(reading)
        }

        // Add meterReadings to data object
        READINGS[deviceName] = meterReadings

        // Increment index for progress fraction
        index++
    }

    await browser.close()

    return {code: 0, msg:'success'}
}

const result = readSolarPanels()
    .then(response => {
        console.log(response)
        if (response.code){
            console.log(`${response.code}: ${response.msg}`)
        } else {
            throw new Error(`unexpected return... ${response}`)
        }
    })
    .catch(err => {
        console.log(`unforeseen errror
            ${err}
        `)
    })