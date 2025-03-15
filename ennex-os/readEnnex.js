// https://pptr.dev/guides/evaluate-javascript

// Imports
const puppeteer = require("puppeteer");
require("dotenv").config();
const axios = require("axios");
const meterlist = require("./meterlist.json");

// Constants
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;
const TIMEOUT_BUFFER = 30000; //DEBUG: lower to 25000 for faster testing
const PV_tableData = [];

// Selectors
const ACCEPT_COOKIES = "#onetrust-accept-btn-handler";
const LOGIN_BUTTON = "button[name='login']";
const USERNAME_SELECTOR = "#username";
const PASSWORD_SELECTOR = "#password";
const DETAILS_TAB_SELECTOR =
  "body > sma-ennexos > div > mat-sidenav-container > mat-sidenav-content > div > div > sma-energy-and-power > sma-energy-and-power-container > div > div > div > div.ng-star-inserted > div.sma-main.ng-star-inserted > sma-advanced-chart > div > div > mat-accordion";

//Non-constants
let page = "";

/**
 * This is a replacement for Puppeteer's deprecated waitForTimeout function.
 * It's not best practice to use this, so try to favor waitForSelector/Locator/etc.
 */
async function waitForTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Logs into the EnnexOS website
 */
async function loginToEnnex() {
  // Go to your site
  await page.goto(process.env.ENNEX_LOGINPAGE, { waitUntil: "networkidle0" });

  // next two lines to make sure it works the same with headless on or off: https://github.com/puppeteer/puppeteer/issues/665#issuecomment-481094738
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36",
  );
  console.log(await page.title());

  await page.locator(ACCEPT_COOKIES).click();
  console.log("Cookies Button found");

  // wait until cookie banner is gone, logging in won't work otherwise
  await page.waitForSelector(ACCEPT_COOKIES, { hidden: true });
  console.log("Cookies banner gone");

  // navigate to login page
  await page.locator("#login > button").click();
  console.log("Navigated to login page");

  // login to ennexOS
  await page.locator(USERNAME_SELECTOR).fill(process.env.ENNEX_USERNAME);
  console.log("Found username selector");

  await page.locator(PASSWORD_SELECTOR).fill(process.env.ENNEX_PWD);
  console.log("Found password selector");

  const maxAttempts = 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      await page.locator(LOGIN_BUTTON).click();
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: TIMEOUT_BUFFER,
      });
      console.log("Login Button Clicked!");
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Login Button not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  console.log("Logged in!");
}

/**
 * Returns yesterday's date in PST as a string in the format "MM/DD/YYYY" (e.g. "10/07/2021")
 */
function getYesterdayInPST() {
  // get current time in UTC
  const now = new Date();

  // subtract one day
  now.setDate(now.getDate() - 1);

  // return the resulting date in PST
  return now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
}

/**
 * Generates a date range between two dates.
 * Parameters:
 *  startDate - The start date in string format YYYY-MM-DD (e.g. "2021-10-01")
 *  endDate - The end date in string format YYYY-MM-DD (e.g. "2021-10-31")
 * Returns: Array of Date objects representing the range.
 */
function generateDateRange(startDate, endDate) {
  const dateArray = [];

  // convert the dates to Date objects
  startDate = new Date(startDate);
  endDate = new Date(endDate);

  // clone the start date so we don't modify the original
  let current = new Date(startDate);

  while (current <= endDate) {
    // push a copy of the current date
    dateArray.push(new Date(current));

    // move to the next day
    current.setDate(current.getDate() + 1);
  }

  return dateArray;
}

/**
 * Parameters:
 * - date: Date object (e.g. new Date() or new Date("2021-10-07"))
 * Returns an object of yesterday's date in MM/DD/YYYY format (e.g. "10/07/2021")
 */
function formatDate(date) {
  // Convert date object to string
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formattedDate;
}

/**
 * Converts a date and time string into multiple formats.
 * Parameters:
 * - dateStr: Date string (e.g. "07/10/2021")
 * - timeStr: Time string (e.g. "12.05 AM")
 * Returns:
 * - END_TIME: Date object
 * - END_TIME_SECONDS Unix timestamp in seconds
 *
 */
function formatTime(dateStr, timeStr) {
    // Convert "MM/DD/YYYY" to "YYYY-MM-DD"
    const [month, day, year] = dateStr.split("/");
    const formattedDate = `${year}-${month}-${day}`;

    // Replace "." with ":" in time (e.g., "12.05 AM" → "12:05 AM")
    const formattedTime = timeStr.replace(".", ":");

    // Combine date and time
    const dateTimeString = `${formattedDate} ${formattedTime}`;

    // Convert dateTimeString to Date object
    const pstDateObj = new Date(dateTimeString).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    });
  
    unixTime = Math.floor(new Date(pstDateObj).getTime() / 1000); // time in seconds

  return {
    END_TIME: pstDateObj,
    END_TIME_SECONDS: unixTime,
  };
}

/**
 * Gets the daily data for a given date and adds it to the PV_tableData array
 */
async function getDailyData(date, meterName, meterID, PVSystem) {
  const ENNEX_DATE = formatDate(date);

  // input the date
  await page.locator('#mat-input-0').fill(ENNEX_DATE);
  await page.keyboard.press('Enter');

  // wait for the row length to be 287 (the number of rows in the table)
  await page.waitForFunction(
    () => document.querySelectorAll('.mat-mdc-row.mdc-data-table__row.cdk-row.ng-star-inserted').length === 287
  );

  // iterate through the rows in the table
  const rows = await page.$$('.mat-mdc-row.mdc-data-table__row.cdk-row.ng-star-inserted');
  for (let i = 2; i <= rows.length + 1; i++) {
    // extract data from the row
    const row = await page.$(`.mat-mdc-row.mdc-data-table__row.cdk-row.ng-star-inserted:nth-child(${i})`);
    const cells = await row.$$('.mat-mdc-cell');
    const timeRecorded = await page.evaluate((el) => el.innerText, cells[0]);
    let energyYield = await page.evaluate((el) => el.innerText, cells[1]);

    // remove any commas if they exist so that parseFloat can handle values over 1,000
    energyYield = energyYield.replace(/,/g, "");

    const { END_TIME, END_TIME_SECONDS } = formatTime(ENNEX_DATE, timeRecorded);

    // create the PVTable object
    const PVTable = {
      meterName,
      meterID,
      END_TIME,
      END_TIME_SECONDS,
      PVSystem,
      energyYield,
    };

    // add the PVTable object to the PV_tableData array
    PV_tableData.push(PVTable);
  }
}

/**
 * Gets the meter data for a given meter and adds it to the PV_tableData array
 */
async function getMeterData(meter) {
  const meterName = meter.meterName;
  const meterID = meter.meterID;
  const url = process.env.ENNEX_LOGINPAGE + "/" + meter.linkSuffix;
  const yesterdayDate = getYesterdayInPST();
  const mostRecentDate = await getLastLoggedDate();
  await page.goto(url + "/monitoring/view-energy-and-power", {
    waitUntil: "networkidle2",
  });

  // details tab
  await page.locator(DETAILS_TAB_SELECTOR).click();
  console.log("Details Tab found and clicked");
  await waitForTimeout(7500);

  // double-check that the meter name is correct
  let PVSystem = await page.$eval(
    '::-p-xpath(//*[@id="header"]/sma-navbar/sma-navbar-container/nav/div[1]/sma-nav-node/div/sma-nav-element/div/div[2]/span)',
    (el) => el.innerText,
  );
  console.log(PVSystem);

  // iterate through the date range and get the daily data
  const dateRange = generateDateRange(mostRecentDate, yesterdayDate);
  for (let i = 0; i < dateRange.length; i++) {
    await getDailyData(
      dateRange[i],
      meterName,
      meterID,
      PVSystem,
    );
  }
}

/**
 * Combines the data from the two meters (OSU operations and OSU Lube Shop) into a single object,
 * if we add more meters in the future, we should consider a meter group instead
 */
function getCombinedMeterData() {
  const combinedData = {};
  const final_PV_tableData = [];

  // iterate through each meter's data
  PV_tableData.forEach((entry) => {
    const { meterName, END_TIME, END_TIME_SECONDS, energyYield } = entry;

    // if meter is not "OSU Operations Total" or "OSU Lube Shop", keep it in the final array as-is
    if (
      meterName !== "OSU Operations" &&
      meterName !== "OSU Operations Lube Shop"
    ) {
      final_PV_tableData.push({
        meterName: meterName,
        meterID: entry.meterID,
        time: END_TIME,
        time_seconds: END_TIME_SECONDS,
        PVSystem: meterName,
        totalYield: energyYield,
      });
      return;
    }

    // initialize a new entry if the date isn't present in combinedData
    if (!combinedData[END_TIME]) {
      combinedData[END_TIME] = {
        meterName: "OSU Operations Total",
        meterID: 124,
        time: END_TIME,
        time_seconds: END_TIME_SECONDS,
        PVSystem: "OSU Operations Total",
        totalYield: 0,
      };
    }

    // sum the total yield for that date
    combinedData[END_TIME].totalYield += parseFloat(energyYield);
  });

  // convert the combinedData hashmap into an array
  final_PV_tableData.push(
    ...Object.values(combinedData).map((entry) => ({
      ...entry,
      totalYield: entry.totalYield.toFixed(2), // ensure correct decimal format
    })),
  );

  return final_PV_tableData;
}

/**
 * Uploads the meter data to the dashboard API
 */
async function uploadMeterData(meterData) {
  const solarmeter = "Solar_Meters";
  await axios({
    method: "post",
    url: `${DASHBOARD_API}/upload`,
    data: {
      id: solarmeter,
      body: meterData,
      pwd: process.env.API_PWD,
      type: "solar",
    },
  })
    .then((res) => {
      console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}`);
    })
    .catch((err) => {
      if (err.response.data.includes("redundant")) {
        console.log(`DUPLICATE DATA: ${err.response.data}`);
      } else
        console.log(
          `ERROR: ${err.response.status}, TEXT: ${err.response.statusText}, DATA: ${err.response.data}`,
        );
    });
}

/**
 *
 * Returns the last date that data was logged to the dashboard
 * Date Format: MM/DD/YYYY (e.g. "10/07/2021")
 */
async function getLastLoggedDate() {
  return getYesterdayInPST(); // TODO: implement a GET request to the API to get the last logged date. For now, just return yesterday's date.
}

(async () => {
  console.log("Accessing EnnexOS Web Page...");

  // launch the browser
  browser = await puppeteer.launch({
    // DEBUG: use --headful flag (e.g. node readEnnex.js --headful), browser will be visible
    // reference: https://developer.chrome.com/articles/new-headless/
    headless: process.argv.includes("--headful") ? false : "new",
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // create a page
  page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

  // login to EnnexOS
  await loginToEnnex();

  // get data for each meter, which is added to the PV_tableData array
  for (let j = 0; j < meterlist.length; j++) {
    await getMeterData(meterlist[j]);
  }

  let final_PV_tableData = getCombinedMeterData();

  // log and upload data for each meter (currently only one meter)
  for (let i = 0; i < final_PV_tableData.length; i++) {
    console.log("\n", final_PV_tableData[i]);

    // use the --no-upload flag to prevent uploading to the API for local development/testing
    // (e.g. node readEnnex.js --no-upload)
    if (!process.argv.includes("--no-upload")) {
      await uploadMeterData(final_PV_tableData[i]);
    }
  }

  // close browser
  await browser.close();
})();
