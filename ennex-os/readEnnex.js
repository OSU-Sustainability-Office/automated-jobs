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
const TIMEOUT_BUFFER = 600000; //DEBUG: lower to 25000 for faster testing
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
const LOGIN_BUTTON = "#login > button";
const USERNAME_SELECTOR = "#mat-input-0";
const PASSWORD_SELECTOR = "#mat-input-1";
const DETAILS_TAB_SELECTOR =
  "body > sma-ennexos > div > mat-sidenav-container > mat-sidenav-content > div > div > sma-energy-and-power > sma-energy-and-power-container > div > div > div > div.ng-star-inserted > div.sma-main.ng-star-inserted > sma-advanced-chart > div > div > mat-accordion";
const MONTHLY_TAB_SELECTOR = "#mat-tab-label-0-2";
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

  // login to ennexOS
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
}

// Automatically detects the timezone difference of US Pacific vs GMT-0 (7 or 8 depending on daylight savings)
// https://stackoverflow.com/questions/20712419/get-utc-offset-from-timezone-in-javascript
function getOffset(timeZone) {
  const timeZoneName = Intl.DateTimeFormat("ia", {
    timeZoneName: "shortOffset",
    timeZone,
  })
    .formatToParts()
    .find((i) => i.type === "timeZoneName").value;
  const offset = timeZoneName.slice(3);
  if (!offset) return 0;

  const matchData = offset.match(/([+-])(\d+)(?::(\d+))?/);
  if (!matchData) throw `cannot parse timezone name: ${timeZoneName}`;

  const [, sign, hour, minute] = matchData;
  let result = parseInt(hour) * 60;
  if (sign === "+") result *= -1;
  if (minute) result += parseInt(minute);

  return result;
}

/**
 * returns an object of yesterday's date in a variety of formats:
 * {
 *    localeTime: [ '10', '7', '2021', '11', '00', '00' ],
 *    END_TIME: '2021-10-07T23:59:59',
 *    END_TIME_SECONDS: '1633622399',
 *    ENNEX_MONTH: '10',
 *    ENNEX_DAY: '07',
 *    ENNEX_DATE: '10/07/2021'
 * }
 */
function formatDateAndTime() {
  // non-unix time calc
  const dateObj = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const localeTime = dateObj
    .toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    .match(/\d+/g);
  const DATE =
    localeTime[2] + "-" + localeTime[0] + "-" + Number(localeTime[1]);
  const END_TIME = `${DATE}T23:59:59`;

  // get month and day in the correct format for ennex website
  let ENNEX_MONTH = "";
  if (parseInt(localeTime[0]) < 10) {
    ENNEX_MONTH = "0" + parseInt(localeTime[0]).toString();
  } else {
    ENNEX_MONTH = localeTime[0];
  }

  let ENNEX_DAY = "";
  if (parseInt(localeTime[1]) < 10) {
    ENNEX_DAY = "0" + parseInt(localeTime[1]).toString();
  } else {
    ENNEX_DAY = localeTime[1];
  }

  // Date is also shown on EnnexOS page in the format MM/DD/YYYY
  let ENNEX_DATE = ENNEX_MONTH + "/" + ENNEX_DAY + "/" + localeTime[2];

  console.log("Offset: ", getOffset("US/Pacific"));

  const dateObjUnix = new Date(
    new Date().getTime() -
      (24 * 60 * 60 * 1000 + getOffset("US/Pacific") * 60 * 1000),
  );

  // unix time calc
  dateObjUnix.setUTCHours(23, 59, 59, 0);
  const END_TIME_SECONDS = Math.floor(dateObjUnix.valueOf() / 1000).toString();

  return {
    localeTime,
    END_TIME,
    END_TIME_SECONDS,
    ENNEX_MONTH,
    ENNEX_DAY,
    ENNEX_DATE,
  };
}

/**
 * If today is the first day of the month, selects the previous month in the
 * dropdown in order to get yesterday's data to show up
 */
async function selectPreviousMonthIfNeeded(formattedDate) {
  // change month tab to previous month if necessary - Date functions are used to conver from numeric <-> string formats
  const monthDropdown = await page.waitForSelector(MONTH_DROPDOWN_SELECTOR);

  // get currently selected month and convert to numeric format
  let selectedMonth = await page.evaluate(
    (month) => month.innerText,
    monthDropdown,
  );

  selectedMonth = MONTHS.indexOf(selectedMonth.slice(0, 3)) + 1;
  console.log("Currently selected month found");

  if (selectedMonth != formattedDate.ENNEX_MONTH) {
    console.log("Changing month selector to previous month");

    prevMonthIndex = formattedDate.ENNEX_MONTH - 1;

    // in January, fix indexing so the previous month is December
    if (prevMonthIndex < 0) prevMonthIndex = 11;

    const prevMonthSelector =
      "#timeline-picker-element_" +
      MONTHS[prevMonthIndex] +
      "\\ " +
      formattedDate.localeTime[2];

    await page.locator(prevMonthSelector).click();

    await waitForTimeout(25000);
  }
}

/**
 * Gets the meter data for a given meter and adds it to the PV_tableData array
 */
async function getMeterData(meter, formattedDate) {
  const meterName = meter.meterName;
  const meterID = meter.meterID;
  const time = formattedDate.END_TIME;
  const time_seconds = formattedDate.END_TIME_SECONDS;

  await page.goto(
    process.env.SEC_LOGINPAGE +
      "/" +
      meter.linkSuffix +
      "/monitoring/view-energy-and-power",
    {
      waitUntil: "networkidle0",
    },
  );

  console.log("\n" + (await page.title()));

  // monthly tab
  await page.locator(MONTHLY_TAB_SELECTOR).click();
  console.log("Monthly Tab found and clicked");

  // details tab
  await page.locator(DETAILS_TAB_SELECTOR).click();
  console.log("Details Tab found and clicked");

  await waitForTimeout(25000);

  let PVSystem = await page.$eval(
    '::-p-xpath(//*[@id="header"]/sma-navbar/sma-navbar-container/nav/div[1]/sma-nav-node/div/sma-nav-element/div/div[2]/span)',
    (el) => el.innerText,
  );

  await selectPreviousMonthIfNeeded(formattedDate);

  // might be redundant but it's a sanity check that the meter name is what we expect
  console.log(PVSystem);

  let monthFlag = false;
  let dayCheck = parseInt(formattedDate.ENNEX_DATE.slice(3, 5));

  // no point in checking multiple attempts, if the frontend state didn't load it's already too late
  // for now just add a big timeout after clicking each of the "Details" / "Monthly" tabs
  // potential TODO: identify loading animations and wait for those to disappear, or some other monthly indicator
  while (!monthFlag) {
    try {
      console.log(`Testing for date ${formattedDate.ENNEX_DATE}`);

      // give detail table time to load
      await waitForTimeout(25000);

      let totalYieldYesterday = await page.$eval(
        '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
          dayCheck +
          "]/mat-cell[2])",
        (el) => el.innerText,
        {
          timeout: 25000,
        },
      );

      // remove any commas if they exist so that parseFloat can handle values over 1,000
      totalYieldYesterday = totalYieldYesterday.replace(/,/g, "");
      console.log(totalYieldYesterday);

      let lastDate = await page.$eval(
        '::-p-xpath(//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
          dayCheck +
          "]/mat-cell[1])",
        (el) => el.innerText,
        {
          timeout: 25000,
        },
      );

      console.log(`Actual date ${lastDate}`);

      const PVTable = {
        meterName,
        meterID,
        time,
        time_seconds,
        PVSystem,
        totalYieldYesterday,
      };
      if (lastDate === formattedDate.ENNEX_DATE) {
        console.log(`It is this day ${formattedDate.ENNEX_DATE}`);
        PV_tableData.push(PVTable);
        console.log("Moving on to next meter (if applicable)");
        monthFlag = true;
        return;
      } else {
        console.log("Date doesn't match");
        throw "Date doesn't match";
      }
    } catch (error) {
      console.log(`Data for this day ${formattedDate.ENNEX_DATE} not found.`);
      console.log("Moving on to next meter (if applicable)");
      monthFlag = true;
      return;
    }
  }
}

/**
 * Combines the data from the two meters (OSU operations and OSU Lube Shop) into a single object,
 * if we add more meters in the future, we should consider a meter group instead
 */
function getCombinedMeterData() {
  const comboTotalYieldYesterday = (
    parseFloat(PV_tableData[0].totalYieldYesterday) +
    parseFloat(PV_tableData[1].totalYieldYesterday)
  ).toFixed(2);

  const comboPVTable = {
    meterName: "OSU Operations Total",
    meterID: 124,
    time: PV_tableData[0].time,
    time_seconds: PV_tableData[0].time_seconds,
    PVSystem: "OSU Operations Total",
    totalYieldYesterday: comboTotalYieldYesterday,
  };
  PV_tableData.push(comboPVTable);

  // remove the first two elements from the array
  return PV_tableData.slice(2);
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

(async () => {
  console.log("Accessing EnnexOS Web Page...");

  // Launch the browser
  browser = await puppeteer.launch({
    // DEBUG: use --headful flag (node readEnnex.js --headful), browser will be visible
    // reference: https://developer.chrome.com/articles/new-headless/
    headless: process.argv.includes("--headful") ? false : "new",
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

  // Login to EnnexOS
  await login();

  // wait for new page to load
  console.log("\n", await page.title());

  // get rid of new pop-up about SMA ID login
  await page
    .locator(
      '::-p-xpath(//*[@id="cdk-overlay-0"]/mat-dialog-container/div/div/sma-banner-dialog/ennexos-dialog-actions/div/ennexos-button/button)',
    )
    .setTimeout(3000)
    .click();

  const formattedDate = formatDateAndTime(1);

  console.log("\ntimeFormats: ", formattedDate);

  // get data for each meter, which is added to the PV_tableData array
  for (let j = 0; j < meterlist.length; j++) {
    await getMeterData(meterlist[j], formattedDate);
  }

  let final_PV_tableData = getCombinedMeterData();

  // log and upload data for each meter (currently only one meter)
  for (let i = 0; i < final_PV_tableData.length; i++) {
    console.log("\n", final_PV_tableData[i]);

    // Use the --no-upload flag to prevent uploading to the API for local development/testing
    // node readEnnex.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await uploadMeterData(final_PV_tableData[i]);
    }
  }

  // Close browser.
  await browser.close();
})();
