// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 25000;
const PAGE_LOAD_TIMEOUT = 30000;
const CLICK_OPTIONS = { clickCount: 10, delay: 100 };
const MAX_TRIES = 5;
const axios = require('axios');
let today = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
let yesterday = new Date(new Date(today).getTime() - (24 * 60 * 60 * 1000)).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
let dateObj = new Date(yesterday);
let year = dateObj.getFullYear();
let month = String(dateObj.getMonth() + 1).padStart(2, '0');
let day = String(dateObj.getDate()).padStart(2, '0');
let formattedYesterday = `${year}-${month}-${day}`;
const pageURL = process.env.TESLA_PAGE_1 + "?date=" + formattedYesterday;

(async () => {
  console.log("Accessing SEC Web Page...");
  console.log(formattedYesterday)
  console.log(pageURL)

  // Launch the browser
  browser = await puppeteer.launch({
    headless: true, // set to false for debug
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_BUFFER);

  // Go to your site
  await page.goto(pageURL, { waitUntil: "networkidle2" });

  // next two lines to make sure it works the same with headless on or off: https://github.com/puppeteer/puppeteer/issues/665#issuecomment-481094738
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36"
  );
  console.log(await page.title());
  
 
    // Move the mouse to the graph element
    // #highcharts-0 > svg > g.highcharts-series-group > g:nth-child(3) > rect:nth-child(20)
  let graphPrefix = '#highcharts-0 > svg > g.highcharts-series-group > g:nth-child(3) > rect:nth-child('
  let popupContentArray = []
  
  for (var i = 1; i <= 24; i++) {

    let graphSelector = graphPrefix + i + ")"

    const graphElement = await page.$(graphSelector);
    const graphElementBox = await graphElement.boundingBox();
    const x = graphElementBox.x + (graphElementBox.width / 2);
    const y = graphElementBox.y + (graphElementBox.height / 2);
    await page.mouse.move(x, y);
  
    // Wait for the popup to appear
    await page.waitForTimeout(1000);
  
    // Read the contents of the popup
    let popupContent = await page.$eval('#highcharts-0 > svg > g.highcharts-tooltip > text', element => element.textContent);

    if (popupContent) {
      //console.log(graphSelector)
      //console.log(`Popup contents: ${popupContent}`);
      //console.log(popupContentArray.length)
      if ( (popupContentArray.length > 0) && (popupContent !== popupContentArray[popupContentArray.length - 1])) {
        //console.log(popupContent)
        //console.log(popupContentArray[popupContentArray.length - 1])
        popupContentArray.push(popupContent)
      } else if (popupContentArray.length === 0) {
        popupContentArray.push(popupContent)
      }
    }
  }
  
  console.log(popupContentArray);
  
  // Close browser.
  await browser.close();
})();
