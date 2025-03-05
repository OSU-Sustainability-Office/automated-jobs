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
const TIMEOUT_BUFFER = 25000; //DEBUG: lower to 25000 for faster testing
const PV_tableData = [];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Selectors
const ACCEPT_COOKIES = "#onetrust-accept-btn-handler";
const LOGIN_BUTTON = "button[name='login']";
const USERNAME_SELECTOR = "#username";
const PASSWORD_SELECTOR = "#password";
const DETAILS_TAB_SELECTOR = "body > sma-ennexos > div > mat-sidenav-container > mat-sidenav-content > div > div > sma-energy-and-power > sma-energy-and-power-container > div > div > div > div.ng-star-inserted > div.sma-main.ng-star-inserted > sma-advanced-chart > div > div > mat-accordion";
const MONTHLY_TAB_SELECTOR = "[data-testid='MONTH']";
const MONTH_DROPDOWN_SELECTOR = ".mat-mdc-select-min-line";

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
async function login() {
  // Go to your site
  await page.goto(process.env.SEC_LOGINPAGE, { waitUntil: "networkidle0" });

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
  await page.locator(USERNAME_SELECTOR).fill(process.env.SEC_USERNAME);
  console.log("Found username selector");

  await page.locator(PASSWORD_SELECTOR).fill(process.env.SEC_PWD);
  console.log("Found password selector");

  const maxAttempts = 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      await page.locator(LOGIN_BUTTON).click();
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeOut: TIMEOUT_BUFFER,
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
  * Returns yesterday's date in PST as a string in the format "MM/DD/YYYY"
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
 *  startDate - The start date in string format (e.g. "2021-10-01")
 *  endDate - The end date in string format (e.g. "2021-10-31")
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
 *    END_TIME: '2021-10-07T23:59:59',
 *    END_TIME_SECONDS: '1633622399',
 *    ENNEX_MONTH: '10',
 *    ENNEX_DAY: '07',
 *    ENNEX_DATE: '10/07/2021'
 * }
 */
function formatDateAndTime(date) {
  const formattedDate = date.toLocaleDateString("en-CA"); // convert date object to string
  const ENNEX_YEAR = formattedDate.split("-")[0];
  let ENNEX_MONTH = formattedDate.split("-")[1];
  let ENNEX_DAY = formattedDate.split("-")[2];
  const ENNEX_DATE = `${ENNEX_MONTH}/${ENNEX_DAY}/${ENNEX_YEAR}`;

  const END_TIME = `${ENNEX_YEAR}-${ENNEX_MONTH}-${ENNEX_DAY}T23:59:59`; // always set to 11:59:59 PM
  const END_TIME_SECONDS = new Date(END_TIME).getTime() / 1000; // END_TIME in seconds

  return {
    END_TIME,
    END_TIME_SECONDS,
    ENNEX_YEAR,
    ENNEX_MONTH,
    ENNEX_DAY,
    ENNEX_DATE,
  };
}

/**
 * If today is the first day of the month, selects the previous month in the
 * dropdown in order to get yesterday's data to show up
 */
async function selectPreviousMonthIfNeeded(year, month) {
  year = parseInt(year);
  month = parseInt(month);

  // wait for the month dropdown
  const monthDropdown = await page.waitForSelector(MONTH_DROPDOWN_SELECTOR);

  // get the currently selected month and convert to numeric format
  let selectedMonth = await page.evaluate(
    (month) => month.innerText,
    monthDropdown
  );

  // dispose the monthDropdown handle
  await monthDropdown.dispose();

  // convert to numeric format
  selectedMonth = MONTHS.indexOf(selectedMonth.slice(0, 3)) + 1;

  // if the current month does not match the desired month, select the previous month
  if (selectedMonth !== month) {
    let prevMonthIndex = month - 1; // Convert to zero-based index

    // fix indexing so January moves to December of the previous year
    if (prevMonthIndex < 0) prevMonthIndex = 11;

    const prevMonthSelector = `#timeline-picker-element_${MONTHS[prevMonthIndex]}\\ ${year}`;

    await page.locator(prevMonthSelector).click();

    // wait for the table to update to the previous month
    await page.waitForFunction(
      (month) => {
        const cell = document.querySelector("#advanced-chart-detail-table mat-row mat-cell:first-child");
        if (cell) {
          console.log(cell.innerText);
          cellMonth = cell.innerText.split("/")[0];
          return parseInt(cellMonth) === month;
        }
        return false;
      },
      {},
      prevMonthIndex + 1
    );

  }
}

/**
 * Gets the daily data for a given date and adds it to the PV_tableData array
 */
async function getDailyData(date, meterName, meterID, PVSystem) {
  const { END_TIME, END_TIME_SECONDS, ENNEX_YEAR, ENNEX_MONTH, ENNEX_DAY, ENNEX_DATE } = formatDateAndTime(date);
  await selectPreviousMonthIfNeeded(ENNEX_YEAR, ENNEX_MONTH);
  let monthFlag = false; // flag to check if the month has been found
  let dayCheck = parseInt(ENNEX_DAY); // day to check in the table
  let totalDailyYield = "0";

  // no point in checking multiple attempts, if the frontend state didn't load it's already too late
  // for now just add a big timeout after clicking each of the "Details" / "Monthly" tabs
  // potential TODO: identify loading animations and wait for those to disappear, or some other monthly indicator
  while (!monthFlag) {
    try {      
      // get the total yield for the given day
      await page.waitForSelector("#advanced-chart-detail-table mat-row");
      totalDailyYield = await page.$eval(
        '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
          dayCheck +
          "]/mat-cell[2])",
        (el) => el.innerText
      );

      // remove any commas if they exist so that parseFloat can handle values over 1,000
      totalDailyYield = totalDailyYield.replace(/,/g, "");

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

      // create the PVTable object
      const PVTable = {
        meterName,
        meterID,
        END_TIME,
        END_TIME_SECONDS,
        PVSystem,
        totalDailyYield,
      };

      // if the date matches, add the data to the PV_tableData array
      if (actualDate === ENNEX_DATE) {
        console.log(`Date: ${ENNEX_DATE} | Energy: ${totalDailyYield}`);
        PV_tableData.push(PVTable);
        monthFlag = true;
        return PVTable;
      } else {
        console.log("Date doesn't match. Actual date: " + actualDate + " | Expected date: " + ENNEX_DATE);
        throw "Date doesn't match";
      }
    } catch (error) {
      console.log(`Data for this day ${ENNEX_DATE} not found.`);
      console.log("Moving on to next meter (if applicable)");
      monthFlag = true;
      return;
    }
  }
}

/**
 * Gets the meter data for a given meter and adds it to the PV_tableData array
 */
async function getMeterData(meter) {
  const meterName = meter.meterName;
  const meterID = meter.meterID;
  const url = process.env.SEC_LOGINPAGE + "/" + meter.linkSuffix;
  const yesterdayDate = getYesterdayInPST();
  const mostRecentDate = await getLastLoggedDate();
  await page.goto(
    url + "/monitoring/view-energy-and-power",
    {
      waitUntil: "networkidle0",
    },
  );

  // monthly tab
  await page.waitForSelector(MONTHLY_TAB_SELECTOR, { state: "visible" });
  await page.click(MONTHLY_TAB_SELECTOR);
  console.log("Monthly Tab found and clicked");

  // details tab
  await page.waitForSelector(DETAILS_TAB_SELECTOR, { visible: true });
  await page.click(DETAILS_TAB_SELECTOR);
  console.log("Details Tab found and clicked");
  await waitForTimeout(7500);

  // double-check that the meter name is correct
  let PVSystem = await page.$eval(
    '::-p-xpath(//*[@id="header"]/sma-navbar/sma-navbar-container/nav/div[1]/sma-nav-node/div/sma-nav-element/div/div[2]/span)',
    (el) => el.innerText,
  );
  console.log(PVSystem);
  
  // iterate through the date range and get the daily data
  const totalData = [];
  const dateRange = generateDateRange(mostRecentDate, yesterdayDate);
  for (let i = 0; i < dateRange.length; i++) {
    const dailyData = await getDailyData(dateRange[i], meterName, meterID, PVSystem);
    if (dailyData) {
      totalData.push(dailyData);
    } else {
      `Data not found for this ${dateRange[i]}`;
    }
  }
  return totalData;
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
    const { meterName, END_TIME, END_TIME_SECONDS, totalDailyYield } = entry;

    // if meter is not "OSU Operations Total" or "OSU Lube Shop", keep it in the final array as-is
    if (meterName !== "OSU Operations" && meterName !== "OSU Operations Lube Shop") {
      final_PV_tableData.push(entry);
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
        totalYieldYesterday: 0,
      };
    }

    // sum the total yield for that date
    combinedData[END_TIME].totalYieldYesterday += parseFloat(totalDailyYield);
  });

  // convert the combinedData hashmap into an array
  final_PV_tableData.push(
    ...Object.values(combinedData).map((entry) => ({
      ...entry,
      totalYieldYesterday: entry.totalYieldYesterday.toFixed(2), // ensure correct decimal format
    }))
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
      console.log(
        `RESPONSE: ${res.status}, TEXT: ${res.statusText}, DATA: ${res.data}`,
      );
    })
    .catch((err) => {
      console.log(err);
    });
}

/**
 * 
 * Returns the last date that data was logged to the dashboard
 */
async function getLastLoggedDate() {
  return "11/04/2024"; // TODO: implement a GET request to the API to get the last logged date
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
  await login();

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
