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

// Automatically detects the timezone difference of US Pacific vs GMT-0 (7 or 8 depending on daylight savings)
// https://stackoverflow.com/questions/20712419/get-utc-offset-from-timezone-in-javascript
function getOffset(timeZone) {
  const timeZoneName = Intl.DateTimeFormat("ia", {
    timeZoneName: "shortOffset",
    timeZone,
  })
    .formatToParts()
    .find((i) => i.type === "timeZoneName")?.value;
  if (!timeZoneName) return 0;

  const matchData = timeZoneName.match(/([+-])(\d+)(?::(\d+))?/);
  if (!matchData) throw `Cannot parse timezone name: ${timeZoneName}`;

  const [, sign, hour, minute] = matchData;
  let result = parseInt(hour) * 60;
  if (sign === "+") result *= -1;
  if (minute) result += parseInt(minute);
  return result;
};

function formatDateAndTime() {
  // non-unix time calc
  const dateObj = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const localeTime = dateObj
    .toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    .match(/\d+/g);
  const DATE =
    localeTime[2] + "-" + localeTime[0] + "-" + Number(localeTime[1]);
  const END_TIME = `${DATE}T23:59:59`;

  // get month and day in the correct format for SEC website
  let SEC_MONTH = "";
  if (parseInt(localeTime[0]) < 10) {
    SEC_MONTH = "0" + parseInt(localeTime[0]).toString();
  } else {
    SEC_MONTH = localeTime[0];
  }

  let SEC_DAY = "";
  if (parseInt(localeTime[1]) < 10) {
    SEC_DAY = "0" + parseInt(localeTime[1]).toString();
  } else {
    SEC_DAY = localeTime[1];
  }

  // Date is also shown on SEC page in the format MM/DD/YYYY
  let SEC_DATE = SEC_MONTH + "/" + SEC_DAY + "/" + localeTime[2];

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
    SEC_MONTH,
    SEC_DAY,
    SEC_DATE,
  };
}

/**
 * Gets the meter data for a given meter and adds it to the PV_tableData array
 */
async function getMeterData(meter, formattedDate) {
  const meterName = meter.meterName;
  const meterID = meter.meterID;
  const time = formattedDate.END_TIME;
  const time_seconds = formattedDate.END_TIME_SECONDS;

  await page.waitForXPath(
    "//*[@id='" + meterlist[i].puppeteerSelector + "']/td[1]/a",
  ); // wait and make sure xpaths loaded
  console.log("x-paths loaded!");

  const PVSystem = await page.evaluate(
    (el) => el.innerText,
    (
      await page.$x(
        "//*[@id='" + meterlist[i].puppeteerSelector + "']/td[1]/a",
      )
    )[0],
  );

  const totalYieldYesterdayElement = await page.$x(
    "//*[@id='" + meterlist[i].puppeteerSelector + "']/td[3]",
  );
  const totalYieldYesterday = await page.evaluate(
    (el) => el.innerText.replace(",", ""),
    totalYieldYesterdayElement[0],
  );

  const PVTable = {
    meterName,
    meterID,
    time,
    time_seconds,
    PVSystem,
    totalYieldYesterday,
  };

  PV_tableData.push(PVTable);
  return

  // TODO ADD VALIDATION CHECKER
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
  const page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

  await loginToSEC(page);

  // wait for new page to load
  console.log("\n", await page.title());

  // get the date and time
  const formattedDate = formatDateAndTime(1);
  console.log("\ntimeFormats: ", formattedDate);

  // get data for each meter, which is added to the PV_tableData array
  for (let j = 0; j < meterlist.length; j++) {
    await getMeterData(meterlist[j], formattedDate);
  }

  // log and upload data for each meter
  for (let i = 0; i < final_PV_tableData.length; i++) {
    console.log("\n", final_PV_tableData[i]);

    // Use the --no-upload flag to prevent uploading to the API for local development/testing
    // node readEnnex.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await uploadMeterData(final_PV_tableData[i]);
    }
  }

  // close the browser
  await browser.close();
})();
