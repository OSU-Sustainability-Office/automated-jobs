// https://pptr.dev/guides/evaluate-javascript

// Imports
const puppeteer = require("puppeteer");
const axios = require("axios");
require("dotenv").config();
const meterlist = require("./meterlist.json");

// Constants
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;
const TIMEOUT_BUFFER = 25000; //DEBUG: lower to 10000 for faster testing
const PV_tableData = [];

// Selectors
const USERNAME_SELECTOR = "input[name='username']";
const PASSWORD_SELECTOR = "input[name='password']";
const ACCEPT_COOKIES = "#onetrust-accept-btn-handler";
const LOGIN_BUTTON = "button[name='login']";

// Non-constants
let page = "";

/**
 * This is a replacement for Puppeteer's deprecated waitForTimeout function.
 * It's not best practice to use this, so try to favor waitForSelector/Locator/etc.
 */
async function waitForTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Logs into the SEC website
 */
async function loginToSEC(page) {
  console.log("Logging into SEC...");
  // Go to SEC login page
  await page.goto(process.env.SEC_LOGINPAGE, { waitUntil: "networkidle0" });

  // Set headers and user agent to ensure consistent behavior with headless on or off
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36"
  );
  console.log(await page.title());

  await page.locator(ACCEPT_COOKIES).click();
  console.log("Cookies Button found");
  
    // wait until cookie banner is gone, logging in won't work otherwise
  await page.waitForSelector(ACCEPT_COOKIES, { hidden: true });
  console.log("Cookies banner gone");

  // navigate to login page
  await page.click("#ctl00_ContentPlaceHolder1_Logincontrol1_SmaIdLoginButton");
  console.log("Navigated to login page");

  // login to SEC
  await page.locator(USERNAME_SELECTOR).fill(process.env.SEC_USERNAME);
  console.log("found username selector");

  await page.locator(PASSWORD_SELECTOR).fill(process.env.SEC_PWD);
  console.log("found password selector");

  const maxAttempts = 5;
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      await page.locator(LOGIN_BUTTON).click();
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeOut: 25000,
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
};

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
 *    SEC_MONTH: '10',
 *    SEC_DAY: '07',
 *    SEC_DATE: '10/07/2021'
 * }
 */
function formatDateAndTime(date) {
  const formattedDate = date.toLocaleDateString("en-CA"); // convert date object to string
  const SEC_YEAR = formattedDate.split("-")[0];
  let SEC_MONTH = formattedDate.split("-")[1];
  let SEC_DAY = formattedDate.split("-")[2];
  const SEC_DATE = `${SEC_MONTH}/${SEC_DAY}/${SEC_YEAR}`;

  const END_TIME = `${SEC_YEAR}-${SEC_MONTH}-${SEC_DAY}T23:59:59`; // always set to 11:59:59 PM
  const END_TIME_SECONDS = new Date(END_TIME).getTime() / 1000; // END_TIME in seconds

  return {
    END_TIME,
    END_TIME_SECONDS,
    SEC_YEAR,
    SEC_MONTH,
    SEC_DAY,
    SEC_DATE,
  };
}

/**
 * If today is the first day of the month, selects the previous month in the
 * dropdown in order to get yesterday's data to show up
 */
async function selectPreviousMonthIfNeeded(year, month) {
  year = parseInt(year);
  month = parseInt(month);
  
  // convert year and month to match the dropdown format (e.g. "January 2021")
  const previousMonth = new Date(year, month - 1).toLocaleString("default", {
    month: "long", // (e.g. "January")
    year: "numeric", // (e.g. "2021")
  });

  // wait for month dropdown element to appear
  const monthDropdownSelector =
    "#ctl00_ContentPlaceHolder1_UserControlShowAnalysisTool1_ChartDatePicker_PC_MonthPickerFrom";
  await page.waitForSelector(monthDropdownSelector);

  // find the visible text option that matches the month name
  const optionHandle = await page.$$(
    `xpath/.//select[@id='ctl00_ContentPlaceHolder1_UserControlShowAnalysisTool1_ChartDatePicker_PC_MonthPickerFrom']/option[text()='${previousMonth}']`
  );

  // use the extracted value to select the dropdown
  if (optionHandle.length > 0) {
    const value = await page.evaluate(el => el.value, optionHandle[0]);
    await page.select(monthDropdownSelector, value);
  } else {
    console.log("Error: Could not find option for", previousMonth);
  }

  // wait until the table reflects the correct month:
  await page.waitForFunction(
    (expectedMonth) => {
      const cell = document.querySelector(
        "#ctl00_ContentPlaceHolder1_UserControlShowAnalysisTool1_ChartDetailSliderTab_ChartDetails_ChartDetailTable tbody tr:nth-child(2) td:first-child"
      );

      if (cell) {
        const selectedDateText = cell.textContent.trim();
        const selectedMonthText = parseInt(selectedDateText.split("/")[1]);
        return selectedMonthText === expectedMonth;
      }
      return false;
    },
    {},
    month
  );
}

/**
  * Returns a boolean indicating whether the selected month matches the given month
 */
async function isCorrectMonth(month) {
  month = parseInt(month);
  
  // wait for the selected date text to appear in the table
  const selectedDateText = await page.$eval(
    "#ctl00_ContentPlaceHolder1_UserControlShowAnalysisTool1_ChartDetailSliderTab_ChartDetails_ChartDetailTable tbody tr:nth-child(2) td:first-child",
    el => el.textContent.trim()
  );
  const selectedMonthText = selectedDateText.split("/")[1]; // extract the month
  
  return parseInt(selectedMonthText) === month;
}

/**
 * Gets the daily data for a given date and adds it to the PV_tableData array
 */
async function getDailyData(date, meterName, meterID, PVSystem) {
  const { END_TIME, END_TIME_SECONDS, SEC_YEAR, SEC_MONTH, SEC_DAY, SEC_DATE } = formatDateAndTime(date);

  if (!await isCorrectMonth(SEC_MONTH)) {
    await selectPreviousMonthIfNeeded(SEC_YEAR, SEC_MONTH);
  }
  
  // let monthFlag = false; // flag to check if the month has been found
  // let dayCheck = parseInt(SEC_DAY); // day to check in the table
  // let totalDailyYield = "0";

  // // no point in checking multiple attempts, if the frontend state didn't load it's already too late
  // // for now just add a big timeout after clicking each of the "Details" / "Monthly" tabs
  // // potential TODO: identify loading animations and wait for those to disappear, or some other monthly indicator
  // while (!monthFlag) {
  //   try {      
  //     // get the total yield for the given day
  //     await page.waitForSelector("#advanced-chart-detail-table mat-row");
  //     totalDailyYield = await page.$eval(
  //       '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
  //         dayCheck +
  //         "]/mat-cell[2])",
  //       (el) => el.innerText
  //     );

  //     // remove any commas if they exist so that parseFloat can handle values over 1,000
  //     totalDailyYield = totalDailyYield.replace(/,/g, "");

  //     // verify table date matches the date we are looking for
  //     let actualDate = await page.$eval(
  //       '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
  //         dayCheck +
  //         "]/mat-cell[1])",
  //       (el) => el.innerText,
  //       {
  //         timeout: TIMEOUT_BUFFER,
  //       },
  //     );

  //     // create the PVTable object
  //     const PVTable = {
  //       meterName,
  //       meterID,
  //       END_TIME,
  //       END_TIME_SECONDS,
  //       PVSystem,
  //       totalDailyYield,
  //     };

  //     // if the date matches, add the data to the PV_tableData array
  //     if (actualDate === SEC_DATE) {
  //       console.log(`Date: ${SEC_DATE} | Energy: ${totalDailyYield}`);
  //       PV_tableData.push(PVTable);
  //       monthFlag = true;
  //       return PVTable;
  //     } else {
  //       console.log("Date doesn't match. Actual date: " + actualDate + " | Expected date: " + SEC_DATE);
  //       throw "Date doesn't match";
  //     }
  //   } catch (error) {
  //     console.log(`Data for this day ${SEC_DATE} not found.`);
  //     console.log("Moving on to next meter (if applicable)");
  //     monthFlag = true;
  //     return;
  //   }
  // }
}

/**
 * Gets the meter data for a given meter and adds it to the PV_tableData array
 */
async function getMeterData(meter) {
  const meterName = meter.meterName;
  const meterID = meter.meterID;
  const yesterdayDate = getYesterdayInPST();
  const mostRecentDate = await getLastLoggedDate();

  // navigate to the meter page
  const PVSystemElement = await page.waitForSelector(`#${meter.puppeteerSelector} td:first-child a`);
  const PVSystem = await page.evaluate(el => el.textContent.trim(), PVSystemElement);
  await PVSystemElement.click();
  console.log(`Navigated to ${PVSystem} page`); // double-check that the meter name is correct

  // dispose the PVSystemElement
  PVSystemElement.dispose();

  // navigate to the analysis page
  await page.waitForSelector("#lmiAnalysisTool");
  await page.click("#lmiAnalysisTool");
  console.log("Navigated to Analysis page");
  await waitForTimeout(3000);

  // months tab
  await page.waitForSelector("#TabLink2");
  await page.click("#TabLink2");
  console.log("Monthly Tab found and clicked");
  await waitForTimeout(3000);

  // details tab
  await page.waitForSelector("#ctl00_ContentPlaceHolder1_UserControlShowAnalysisTool1_ChartDetailSliderTab_lblSliderTabHead");
  await page.click("#ctl00_ContentPlaceHolder1_UserControlShowAnalysisTool1_ChartDetailSliderTab_lblSliderTabHead");
  console.log("Details Tab found and clicked");
  await waitForTimeout(3000);

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
  console.log("Accessing SEC Web Page...");

  // launch the browser
  browser = await puppeteer.launch({
    // DEBUG: use --headful flag (node readSEC.js --headful), browser will be visible
    // reference: https://developer.chrome.com/articles/new-headless/
    headless: process.argv.includes("--headful") ? false : "new",
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // create a page
  page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

  await loginToSEC(page);

  // get data for each meter, which is added to the PV_tableData array
  for (let j = 0; j < meterlist.length; j++) {
    await getMeterData(meterlist[j]);
  }

  // log and upload data for each meter
  for (let i = 0; i < PV_tableData.length; i++) {
    console.log("\n", PV_tableData[i]);

    // Use the --no-upload flag to prevent uploading to the API for local development/testing
    // node readSEC.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await uploadMeterData(PV_tableData[i]);
    }
  }

  // close the browser
  await browser.close();
})();
