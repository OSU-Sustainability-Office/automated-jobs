/**
    Filename: readTeslaPanels.js
    Description: automatically reads the solar panels data on the mysolarcity Tesla web-interface.
**/
const puppeteer = require('puppeteer')
require('dotenv').config()

const TIMEOUT_BUFFER = 25000 
const PAGE_LOAD_TIMEOUT = 30000
const CLICK_OPTIONS = {clickCount: 10, delay: 100}

let browser = null

function csvToJsonArray(csv){
  let lines = csv.split('\n')
  let headers = lines[0].split(',').map(header => header.replace(/"|\r/g, ''))
  let readingsText = lines.slice(1)
  const json = []
  for (let line of readingsText){
    const readings = line.split(',')
    const jsonReading = {}
    for (let index = 0; index < headers.length; index++){
      jsonReading[headers[index]] = readings[index]
    }
    json.push(jsonReading)
  }
  return json
}

async function readTeslaPanels() {
  console.log('Accessing Tesla Web Page...')
  
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    executablePath: 'google-chrome-stable'
  })

  const page = await browser.newPage()
  page.setDefaultTimeout(TIMEOUT_BUFFER)

  // Login to the Tesla service
  await page.goto(process.env.TESLA_LOGINPAGE)
  
  const USERNAME_SELECTOR = '#username'
  await page.waitForSelector(USERNAME_SELECTOR)
  await page.type(USERNAME_SELECTOR, process.env.TESLA_USERNAME)

  const PASSWORD_SELECTOR = '#password'
  await page.waitForSelector(PASSWORD_SELECTOR)
  await page.type(PASSWORD_SELECTOR, process.env.TESLA_PWD)

  const LOGIN_BUTTON_SELECTOR = '[translate="LOGIN.log_in_button"]'
  await page.waitForSelector(LOGIN_BUTTON_SELECTOR)
  const LOGIN_BUTTON = await page.$(LOGIN_BUTTON_SELECTOR)
  await LOGIN_BUTTON.click(CLICK_OPTIONS)

  console.log("Waiting for cookies to load...")

  // Wait to for success response from solar city 
  await page.waitForResponse(
    (res) => 
      (res.url() === 'https://mysolarcity.com/') && (res.status() === 200)
  )

  // Wait for the page to finish loading (guarantees cookies are loaded)
  await page.waitForNavigation({
    waitUntil: 'domcontentloaded'
  })

  // Read CSV data from Solar City API

  const DEVICES = {
    '35th St. Solar Array': '007c9349-72ba-450c-aa1f-4e5a77b68f79',
    '53rd St. Solar Array': '9D5EB0D2-E376-44A1-9B8C-8DFCDD7507A5',
    'Hermiston Solar Array': '38954c21-8669-47b6-8376-835cc24f908c',
    'Nwrec Data Solar Array': '47cf089a-5b93-4200-8566-e030cb4f8574',
    'Aquatic Animal Health Lab Solar Array': 'BB1ABBE8-1FB9-4C17-BB0A-A1DE9339DB1C'
  }

  // Create today's date
  const dateObj = new Date()
  const DATE = `${dateObj.getFullYear()}-${dateObj.getMonth()+1}-${dateObj.getDate()}`
  const START_TIME = `${DATE}T00:00:00`
  const END_TIME   = `${DATE}T23:59:59`

  const READINGS = {}

  for (let [name, meter_id] of Object.entries(DEVICES)){
    console.log(`Reading ${name}'s meter data...`)
    const URL = `${process.env.TESLA_API}${meter_id}/summary?StartTime=${START_TIME}&EndTime=${END_TIME}&Period=QuarterHour`

    const csvText = await page.evaluate( (url) => {
      return fetch(url, {
        method: 'GET',
        credentials: 'include'
      }).then(r => r.blob()).then(blob => blob.text())
    }, URL)
  
    READINGS[meter_id] = csvToJsonArray(csvText)

  }

  await browser.close()

  return READINGS
}

module.exports = readTeslaPanels
