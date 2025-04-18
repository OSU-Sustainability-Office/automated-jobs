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
const TIMEOUT_BUFFER = 60000; //DEBUG: lower to 25000 for faster testing
const PV_tableData = new Map();
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Selectors
const ACCEPT_COOKIES = "#cmpwrapper >>> a.cmpboxbtn.cmpboxbtnyes.cmptxt_btn_yes";
const LOGIN_BUTTON = "button[name='login']";
const USERNAME_SELECTOR = "#username";
const PASSWORD_SELECTOR = "#password";
const DETAILS_TAB_SELECTOR =
  "body > sma-ennexos > div > mat-sidenav-container > mat-sidenav-content > div > div > sma-energy-and-power > sma-energy-and-power-container > div > div > div > div.ng-star-inserted > div.sma-main.ng-star-inserted > sma-advanced-chart > div > div > mat-accordion";
const MONTHLY_TAB_SELECTOR = "[data-testid='MONTH']";
const MONTH_DROPDOWN_SELECTOR = "#mat-select-value-0";

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
 * Returns an object of yesterday's date in a variety of formats:
 * {
 *    DATE_TIME: '2021-10-07T23:59:59',
 *    UNIX_TIME: '1633622399',
 *    ENNEX_YEAR: '2021',
 *    ENNEX_MONTH: '10',
 *    ENNEX_DAY: '07',
 *    ENNEX_DATE: '10/07/2021'
 * }
 */
function formatDateAndTime(date) {
  // Convert date object to string
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ENNEX_DATE = formattedDate;
  const [ENNEX_MONTH, ENNEX_DAY, ENNEX_YEAR] = formattedDate.split("/");
  const DATE_TIME = `${ENNEX_YEAR}-${ENNEX_MONTH}-${ENNEX_DAY}T23:59:59`; // always set to 11:59:59 PM (PST)
  const UNIX_TIME =
    new Date(
      new Date(DATE_TIME).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
      }),
    ).getTime() / 1000; // END_TIME in seconds (PST)

  return {
    DATE_TIME,
    UNIX_TIME,
    ENNEX_YEAR,
    ENNEX_MONTH,
    ENNEX_DAY,
    ENNEX_DATE,
  };
}

/**
 * Selects the correct year and month in the dropdowns if needed.
 */
async function changeMonthIfNeeded(year, month) {
  year = parseInt(year);
  month = parseInt(month);

  // click yearly dropdown
  await page.locator("#mat-select-value-1").click();

  // choose correct year option
  const yearOptions = await page.$$(".mat-mdc-option.mdc-list-item");
  for (const option of yearOptions) {
    const text = await option.evaluate((el) => el.textContent.trim());
    if (text === year.toString()) {
      await option.click();
      break;
    }
  }

  // click monthly dropdown
  await page.locator(MONTH_DROPDOWN_SELECTOR).click();

  // choose correct month option
  const monthOptions = await page.$$(".mat-mdc-option.mdc-list-item");
  for (const option of monthOptions) {
    const text = await option.evaluate((el) => el.textContent.trim());
    if (text === MONTHS[month - 1]) {
      await option.click();
      break;
    }
  }

  // wait for the table to update to the correct month and year
  await page.waitForFunction(
    (month, year) => {
      const cell = document.querySelector(
        "#advanced-chart-detail-table mat-row mat-cell:first-child",
      );
      if (cell) {
        const cellMonth = cell.innerText.split("/")[0];
        const cellYear = cell.innerText.split("/")[2];
        return parseInt(cellMonth) === month && parseInt(cellYear) === year;
      }
      return false;
    },
    {},
    month,
    year,
  );
}

/**
 * If the meter and date exists in the PV_tableData map, add the energy yield to the existing entry.
 * Otherwise, create a new entry in the map.
 */
function addEnergyYieldToMap(
  meterName,
  meterID,
  DATE_TIME,
  UNIX_TIME,
  PVSystem,
  totalDailyYield,
) {
  // combine the energy yield for OSU Operations and OSU Lube Shop into a single entry
  if (
    meterName === "OSU Operations" ||
    meterName === "OSU Operations Lube Shop"
  ) {
    meterName = "OSU Operations Total";
    meterID = 124;
  }

  // create a unique key for the entry in the Map (meterName + date)
  const key = `${meterName}_${DATE_TIME}`;

  // check if the key exists in PV_tableData
  if (PV_tableData.has(key)) {
    // if it does, add the energy yield to the existing entry
    PV_tableData.get(key).totalYield += totalDailyYield;
  } else {
    // if not, create a new entry
    PV_tableData.set(key, {
      meterName,
      meterID,
      time: DATE_TIME,
      time_seconds: UNIX_TIME,
      PVSystem,
      totalYield: totalDailyYield,
    });
  }
}

/**
 * Gets the daily data for a given date and adds it to the PV_tableData array
 */
async function getDailyData(date, meterName, meterID, PVSystem) {
  const {
    DATE_TIME,
    UNIX_TIME,
    ENNEX_YEAR,
    ENNEX_MONTH,
    ENNEX_DAY,
    ENNEX_DATE,
  } = formatDateAndTime(date);
  let dayCheck = parseInt(ENNEX_DAY); // day to check in the table
  let totalDailyYield = "0";

  try {
    // navigate to the desired date
    await changeMonthIfNeeded(ENNEX_YEAR, ENNEX_MONTH);

    // get the total yield for the given day
    await page.waitForSelector("#advanced-chart-detail-table mat-row");
    totalDailyYield = await page.$eval(
      '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
        dayCheck +
        "]/mat-cell[2])",
      (el) => el.innerText,
    );

    // remove any commas if they exist so that parseFloat can handle values over 1,000
    totalDailyYield = totalDailyYield.replace(/,/g, "");
    totalDailyYield = parseFloat(totalDailyYield);

    // verify table date matches the date we are looking for
    let actualDate = await page.$eval(
      '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
        dayCheck +
        "]/mat-cell[1])",
      (el) => el.innerText,
      {
        timeout: TIMEOUT_BUFFER,
      },
    );

    // if the date matches, add the data to the PV_tableData array
    if (actualDate === ENNEX_DATE) {
      console.log(`Date: ${ENNEX_DATE} | Energy: ${totalDailyYield}`);
      // add the energy yield to the PV_tableData map
      addEnergyYieldToMap(
        meterName,
        meterID,
        DATE_TIME,
        UNIX_TIME,
        PVSystem,
        totalDailyYield,
      );
    } else {
      console.log(
        "Date doesn't match. Actual date: " +
          actualDate +
          " | Expected date: " +
          ENNEX_DATE,
      );
      throw "Date doesn't match";
    }
  } catch (error) {
    console.log(`Data for this day ${ENNEX_DATE} not found.`);
    console.log("Moving on to next meter (if applicable)");
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
    waitUntil: "networkidle0",
  });

  // monthly tab
  await page.locator(MONTHLY_TAB_SELECTOR).click();
  console.log("Monthly Tab found and clicked");

  // details tab
  await page.locator(DETAILS_TAB_SELECTOR).click();
  console.log("Details Tab found and clicked");
  await waitForTimeout(7500);

  // double-check that the meter name is correct
  let PVSystem = await page.$eval(
    '::-p-xpath(//*[@id="header"]/sma-navbar/sma-navbar-container/nav/div[1]/sma-nav-node/div/sma-nav-element/div/div[2]/span)',
    (el) => el.innerText,
  );
  console.log("Meter Name:", PVSystem);

  // iterate through the date range and get the daily data
  const dateRange = generateDateRange(mostRecentDate, yesterdayDate);
  for (let i = 0; i < dateRange.length; i++) {
    await getDailyData(dateRange[i], meterName, meterID, PVSystem);
  }
}

/**
 * Normalizes the meter data in the PV_tableData map into an array of objects.
 * Returns: Array of objects representing the meter data.
 */
function normalizeMeterData() {
  // convert the PV_tableData map into an array of objects
  const normalized_PV_tableData = Array.from(PV_tableData.values()).map(
    (entry) => ({
      ...entry,
      totalYield: parseFloat(entry.totalYield.toFixed(2)), // round to 2 decimal places
    }),
  );

  return normalized_PV_tableData;
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

  await loginToEnnex();

  // get data for each meter, which is added to the PV_tableData array
  for (let j = 0; j < meterlist.length; j++) {
    await getMeterData(meterlist[j]);
  }

  let normalized_PV_tableData = normalizeMeterData();

  // log and upload data for each meter
  for (let i = 0; i < normalized_PV_tableData.length; i++) {
    console.log("\n", normalized_PV_tableData[i]);

    // use the --no-upload flag to prevent uploading to the API for local development/testing
    // (e.g. node readEnnex.js --no-upload)
    if (!process.argv.includes("--no-upload")) {
      await uploadMeterData(normalized_PV_tableData[i]);
    }
  }

  await browser.close();
})();
