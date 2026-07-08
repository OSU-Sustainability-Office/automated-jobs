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
  let loggedIn = false;

  while (attempt < maxAttempts) {
    try {
      await page.locator(LOGIN_BUTTON).click();
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: TIMEOUT_BUFFER,
      });
      console.log("Login Button Clicked!");
      loggedIn = true;
      break;
    } catch (error) {
      console.log(
        `Login Button not found (Attempt ${attempt + 1} of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  // Don't proceed as if authenticated when every attempt failed — otherwise the
  // downstream site-list wait just hangs until timeout with a misleading error.
  if (!loggedIn) {
    throw new Error(`Failed to log into SolarEdge after ${maxAttempts} attempts`);
  }

  console.log("Logged in!");
}

/**
 * Returns yesterday's date in PST as a string in the format "MM/DD/YYYY"
 * (e.g. "10/07/2021")
 */
function getYesterdayInPST() {
  // Resolve today's calendar date in PST first, then subtract a day in
  // calendar space. A flat -24h shift (setDate on the raw instant) lands on
  // the wrong date across DST transitions, when a day isn't 24h long.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = +parts.find((p) => p.type === "year").value;
  const month = +parts.find((p) => p.type === "month").value;
  const day = +parts.find((p) => p.type === "day").value;

  const yesterday = new Date(Date.UTC(year, month - 1, day));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  return `${yesterday.getUTCMonth() + 1}/${yesterday.getUTCDate()}/${yesterday.getUTCFullYear()}`;
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

  try {
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

    // Guard against empty or non-numeric cells (e.g. "—", "N/A"). An unvalidated
    // NaN serializes to null over the wire and silently corrupts downstream data.
    if (!Number.isFinite(totalYield)) {
      console.warn(
        `SKIPPING ${PVSystem} (${meter.meterName}): non-numeric energyYesterday value "${energyYesterdayText}"`,
      );
      return null;
    }

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
  } catch (error) {
    // A missing row / failed read shouldn't sink the batch. Log and move on so
    // the remaining meters still upload (matches the sibling scrapers).
    console.log(
      `Data for meter ${meter.meterName} (siteId ${meter.siteId}) not found.`,
    );
    console.log("Moving on to next meter (if applicable)");
    return null;
  }
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
      // Axios only sets err.response when the server responded. Network/DNS/
      // timeout errors have no response, so guard against reading .data on
      // undefined and coerce non-string bodies before calling .includes().
      const data = err.response?.data;
      const dataStr = typeof data === "string" ? data : JSON.stringify(data ?? "");

      if (dataStr.includes("redundant")) {
        console.log(`DUPLICATE DATA: ${dataStr}`);
      } else if (err.response) {
        console.log(
          `ERROR: ${err.response.status}, TEXT: ${err.response.statusText}, DATA: ${dataStr}`,
        );
      } else {
        console.log(`REQUEST FAILED: ${err.code ?? ""} ${err.message}`);
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

  try {
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
  } finally {
    // Always close the browser so a mid-run failure doesn't leak a Chromium
    // process on the host (this job runs on a schedule).
    await browser.close();
  }
})().catch((err) => {
  // Surface fatal errors (e.g. login failure) with a non-zero exit code so the
  // scheduler flags the run instead of treating a hard failure as success.
  console.error(`FATAL: ${err.message}`);
  process.exitCode = 1;
});
