// Imports
const puppeteer = require("puppeteer");
const axios = require("axios");
require("dotenv").config();
const meterlist = require("./meterlist.json");

// Constants
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;
const TIMEOUT_BUFFER = 60000;
const PV_tableData = [];
const SITE_LIST_URL = "https://monitoring.solaredge.com/one#/site-list";

// Selectors
const USERNAME_SELECTOR = "input[name='username']";
const PASSWORD_SELECTOR = "input[name='password']";
const LOGIN_BUTTON = "button[type='submit']";

// Non-constants
let page = "";
let browser = "";

/**
 * This is a replacement for Puppeteer's deprecated waitForTimeout function.
 * It's not best practice to use this, so try to favor waitForSelector/Locator/etc.
 */
async function waitForTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Logs into the SolarEdge monitoring portal
 */
async function loginToSolarEdge() {
  console.log("Logging into SolarEdge...");

  await page.goto(process.env.SOLAREDGE_LOGINPAGE, {
    waitUntil: "networkidle0",
  });
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36",
  );
  console.log(await page.title());

  // Click login button to initiate OAuth flow
  await page.locator("#se-signing-mfe .signin-content button").click();
  console.log("Navigated to login page");

  // Wait for OAuth login page credentials form
  await page.waitForSelector(USERNAME_SELECTOR, { visible: true });

  await page.locator(USERNAME_SELECTOR).fill(process.env.SOLAREDGE_USERNAME);
  console.log("Found username selector");

  await page.locator(PASSWORD_SELECTOR).fill(process.env.SOLAREDGE_PWD);
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
      break;
    } catch (error) {
      console.log(
        `Login Button not found (Attempt ${attempt + 1} of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  console.log("Logged in!");
}

/**
 * Returns yesterday's date in PST as a string in the format "MM/DD/YYYY"
 * (e.g. "10/07/2021")
 */
function getYesterdayInPST() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
}

/**
 * Parameters:
 * - date: Date object (e.g. new Date() or new Date("2021-10-07"))
 * Returns an object with the date formatted for the API:
 * {
 *    DATE_TIME: '2021-10-07T23:59:59',
 *    UNIX_TIME: 1633622399
 * }
 */
function formatDateAndTime(date) {
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [MONTH, DAY, YEAR] = formattedDate.split("/");
  const DATE_TIME = `${YEAR}-${MONTH}-${DAY}T23:59:59`;
  const UNIX_TIME =
    new Date(
      new Date(DATE_TIME).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
      }),
    ).getTime() / 1000;

  return { DATE_TIME, UNIX_TIME };
}

/**
 * Reads yesterday's energy yield for a given meter from the site list table
 * and adds it to the PV_tableData array.
 */
async function getMeterData(meter) {
  const { DATE_TIME, UNIX_TIME } = formatDateAndTime(
    new Date(getYesterdayInPST()),
  );

  const rowSelector = `[data-id="${meter.siteId}"]`;
  await page.waitForSelector(rowSelector);

  // Read site name from the table (for logging and verification)
  const PVSystem = await page.$eval(
    `${rowSelector} [data-field="name"]`,
    (el) => el.innerText.trim(),
  );

  // Read yesterday's finalized energy yield in kWh
  const energyYesterdayText = await page.$eval(
    `${rowSelector} [data-field="energyYesterday"]`,
    (el) => el.innerText.trim(),
  );

  // Remove commas so parseFloat handles values over 1,000
  const totalYield = parseFloat(energyYesterdayText.replace(/,/g, ""));
  console.log(`${PVSystem} | Energy Yesterday: ${totalYield} kWh`);

  const PVTable = {
    meterName: meter.meterName,
    meterID: meter.meterID,
    time: DATE_TIME,
    time_seconds: UNIX_TIME,
    PVSystem,
    totalYield,
  };

  PV_tableData.push(PVTable);
  return PVTable;
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
      } else {
        console.log(
          `ERROR: ${err.response.status}, TEXT: ${err.response.statusText}, DATA: ${err.response.data}`,
        );
      }
    });
}

(async () => {
  console.log("Accessing SolarEdge Web Page...");

  browser = await puppeteer.launch({
    // DEBUG: use --headful flag (node readSolarEdge.js --headful), browser will be visible
    headless: process.argv.includes("--headful") ? false : "new",
    args: ["--no-sandbox"],
  });

  page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

  await loginToSolarEdge();

  // Navigate to site list — both meters are visible in one table
  await page.goto(SITE_LIST_URL, { waitUntil: "networkidle0" });
  console.log("Navigated to site list");

  // Wait for DataGrid rows to load
  await page.waitForSelector("[data-id]");
  console.log("Site list loaded");

  // Get data for each meter
  for (let j = 0; j < meterlist.length; j++) {
    await getMeterData(meterlist[j]);
  }

  // Log and upload data for each meter
  for (let i = 0; i < PV_tableData.length; i++) {
    console.log("\n", PV_tableData[i]);

    // Use --no-upload flag to prevent uploading to the API for local testing
    // node readSolarEdge.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await uploadMeterData(PV_tableData[i]);
    }
  }

  await browser.close();
})();
