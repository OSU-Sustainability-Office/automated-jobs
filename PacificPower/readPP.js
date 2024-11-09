// TODO comments below about renaming variables will probably go to a separate PR (unless it is a new variable added by this PR)

// https://pptr.dev/guides/evaluate-javascript

// total runtime with current parameters: As fast as 4 minutes not counting last noData checks, or 9 minutes with noData checks

// The various timeouts and while loops + try/catch blocks on this page are probably overkill, but the errors seem to show up at
// random (based on Internet speed etc), so better safe than sorry for production. You can lower the timeouts for debug.

// Misc Constants / imports
const puppeteer = require("puppeteer");
const moment = require("moment-timezone");
require("dotenv").config();
const startDate = moment().unix();
const actual_days_const = 1; // DEBUG: change for testing an older date
const row_days_const = 1;
const maxPrevDayCount = 7;
const TIMEOUT_BUFFER = 1200000; // Currently set for 20 minutes (1,200,000 ms), based on results as noted above
const axios = require("axios");
const fs = require("fs");
const maxAttempts = 8; // needs to be at least 8 with current code because we check these timeframes (monthly): [2 year, 1 month, 1 year, 1 month, 1 day, 1 month, 1 week, 1 month]
const DASHBOARD_API = process.argv.includes("--local-api")
  ? process.env.LOCAL_API
  : process.env.DASHBOARD_API;

// PacificPower Selectors (chrome debug instructions: inspect element > element > copy selector / Xpath)
const ACCEPT_COOKIES = "button.cookie-accept-button";
const LOCATION_BUTTON = "a.modalCloseButton"; // button for closing a popup about what state you're in
const SIGN_IN_PAGE_BUTTON = "a.link.link--default.link--size-default.signin"; // This is the button that takes you to the sign in page, not the button you press to actually log in
const SIGN_IN_IFRAME = 'iframe[src="/oauth2/authorization/B2C_1A_PAC_SIGNIN"]';
const SIGN_IN_INPUT = "input#signInName"; // aka username
const SIGN_IN_PASSWORD = "input#password";
const LOGIN_BUTTON = "button#next"; // This is the actual login button, as opposed to signin page button
const LOADING_BACKDROP_TRANSPARENT =
  "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing";
const LOADING_BACKDROP_DARK =
  "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing";
// The next two selectors below correspond to a button that converts line graph data on PacificPower to table format
const GRAPH_TO_TABLE_BUTTON_MONTHLY =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(3) > img";
const GRAPH_TO_TABLE_BUTTON_YEARLY =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div > a:nth-child(3) > img";
const METER_MENU = "#mat-select-1 > div > div.mat-select-value > span";
const TIME_MENU = "#mat-select-2 > div > div.mat-select-value > span";
const YEAR_IDENTIFIER = "span ::-p-text(One Year)";
const MONTH_IDENTIFIER = "span ::-p-text(One Month)";
const WEEK_IDENTIFIER = "span ::-p-text(One Week)";
const TWO_YEAR_IDENTIFIER = "span ::-p-text(Two Year)";
const DAY_IDENTIFIER = "span ::-p-text(One Day)";
const GRAPH_SELECTOR =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area";
// Selector below corresponds to monthly meter data table, add row number to get specific row data (e.g. + "1)" for first row of data)
const MONTHLY_TABLE_ROW_SELECTOR =
  GRAPH_SELECTOR +
  " > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(";

// timeframe related variables
let yearCheck = false; // true = "One Year" text detected in timeframe dropdown menu for current meter
let prevDayFlag = false; // true = continue to check previous days' data, false = stop checking previous days' data (for current meter id)
let monthCheck = false; // true = "One Month" text detected in timeframe dropdown menu for current meter
let weekCheck = false; // true = "One Week" text detected in timeframe dropdown menu for current meter
let timeframeCheck = false; // generic boolean for any type of timeframe (similar logic as yearCheck, weekCheck, etc)
let timeframeChoices = []; // list of valid timeframes per meter ("1 year", "1 month", etc). NOTE: Can be different for yearly vs monthly meter type
let timeframeIterator = 0; // increment this every time invalid top row meter data is detected, and we need to try another timeframe

// control flow flags (booleans)
let attemptLoginFlag = true; // false = some kind of error en route to the first meter's page (e.g. login error)
let loginSuccessFlag = false; // true = successfully logged in to Pacific Power website and retrieved meter selector number
let meterErrorsFlag = false; // true = generic error detected, see otherErrorArray (highest level flag for meter checking)
let continueLoadingFlag = false; // true = loading screen not yet detected for the current meter (highest level flag for meter checking)
let monthlyDataTopRowErrorFlag = false; // true = errors detected when reading meter data top row ("monthly_top"). (second highest level flag)

// control flow iterators (counters)
let loginErrorCount = 0; // increment this every time there is an error en route to the first meter's page (e.g. login error)
let meterErrorCount = 0; // increment this every time there is a generic error detected, see otherErrorArray (highest level flag for meter checking)
let loadingScreenErrorCount = 0; // increment this every time loading screen not yet detected for the current meter (highest level flag for meter checking)
let monthlyDataTopRowError = 0; // increment this every time errors are detected when reading meter data top row ("monthly_top"). (second highest level flag)

// Misc Variables (initialization)
let page = ""; // current browser page being used by Puppeteer (set headless: false for a visual explanation)
let graphButton = ""; // button on PacificPower site that converts data from line graph to table format (see GRAPH_TO_TABLE_BUTTON_MONTHLY / YEARLY)
let pp_meter_id = ""; // A meter's PacificPower meter ID (e.g. 78645606)
let first_selector_num = 0; // keeps track of the "meter_selector_num" value of the first detected meter
let monthly_top = ""; // NOTE: different variable from MONTHLY_TABLE_ROW_SELECTOR constant, although they should probably be combined (TODO)
let monthly_top_text = ""; // text string extracted from the top row of meter data (MONTHLY_TABLE_ROW_SELECTOR selector)
let meter_selector_full = ""; // full text of the current meter from meter dropdown menu, e.g. "34306 NE ELECTRIC RD CORVALLIS OR (Item #224) (Meter #78645606)"
let meter_selector_num = ""; // inspect element > see div with ID "#mat-option-<meter_selector_num>", e.g. "#mat-option-1"
let PPTable = {}; // individual meter data object contained within PPArray. TODO: Rename this variable
let PPArray = []; // Array of Objects (PPTable), with valid data queued to be uploaded (TODO: Rename this variable to something more clear)
let unAvailableErrorArray = []; // list of meters with "unavailable" in top row text (error)
let deliveredErrorArray = []; // list of meters with "delivered" in top row text (error)
let otherErrorArray = []; // list of meters with generic highest level error detected (see meterErrorCount / meterErrorsFlag)
let yearlyArray = []; // list of yearly type meters (only shows "1 year" and "2 years" in timeframe dropdown menu)

// PP Recent variables (missing data detection)
let pp_recent_data = null; // list of meters from ppRecent endpoint (SQL database)
let pp_recent_filtered = []; // list of meters on PacificPower page, with matching meter ID with ppRecent endpoint
let pp_recent_matching = null; // list of meters on PacificPower page, with matching meter ID with ppRecent endpoint
let pp_recent_matching_time = null; // check if current meter exists on ppRecent endpoint
let upload_queue_matching = null; // check if current meter ID exists in upload queue (PPArray)
let upload_queue_matching_time = null; // check if current meter ID and time_seconds value exists in upload queue (PPArray)

// PP Exclusion variables (blacklist excluded meters, detect new meters)
let pp_meters_exclusion_list = null; // list of meters from ppExclude endpoint
let pp_meters_exclude = []; // list of meters on PacificPower page we have excluded based on ppExclude endpoint
let pp_meters_include = []; // list of meters on PacificPower page we have included based on ppExclude endpoint
let pp_meters_exclude_not_found = []; // list of (new) meters on PacificPower page we have excluded based on ppExclude endpoint

// -------------------------------- Sign-in functions ---------------------------- //

/**
 * Sign in to the Pacific Power website.
 */
async function signInToPacificPower() {
  console.log("Accessing Pacific Power Web Page...");

  // Go to your site
  await page.goto(process.env.PP_LOGINPAGE, {
    waitUntil: "networkidle0",
    timeout: 25000,
  });

  // next two lines to make sure it works the same with headless on or off: https://github.com/puppeteer/puppeteer/issues/665#issuecomment-481094738
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36",
  );
  console.log(await page.title());

  await waitForTimeout(25000);

  // if first time logging in
  if (loginErrorCount === 0) {
    await page.waitForSelector(ACCEPT_COOKIES);
    console.log("Cookies Button found");

    await page.click(ACCEPT_COOKIES);
    await page.click(LOCATION_BUTTON);
    console.log("Location Button clicked");
    // helpful for logging into sign in form within iframe: https://stackoverflow.com/questions/46529201/puppeteer-how-to-fill-form-that-is-inside-an-iframe

    await page.click(SIGN_IN_PAGE_BUTTON);
    console.log("SignIn Page Button Clicked!");

    // this one needs more timeout, based on results from stresstest.sh
    await page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    console.log(await page.title());
    console.log("waiting for iframe with form to be ready.");
    await waitForTimeout(25000);
    await page.waitForSelector("iframe", { timeout: 60000 });
    console.log("iframe is ready. Loading iframe content");

    const signin_iframe = await page.$(SIGN_IN_IFRAME);
    const frame = await signin_iframe.contentFrame();

    console.log("filling username in iframe");

    await frame.type(SIGN_IN_INPUT, process.env.PP_USERNAME);

    console.log("filling password in iframe");
    await frame.type(SIGN_IN_PASSWORD, process.env.PP_PWD);

    await frame.click(LOGIN_BUTTON);
    console.log("Login Button clicked");
    // this one needs more timeout, based on results from stresstest.sh
    await page.waitForNavigation({
      waitUntil: "networkidle0",
      timeout: 60000,
    });
    console.log(await page.title());
    console.log(
      "First time logged in, continuing to Account > Energy Usage Page",
    );

    // DEBUG: uncomment for login error handling
    // throw "testing login error handling try again";
  } else if (loginErrorCount > 0) {
    console.log("Already logged in, continuing to Account > Energy Usage Page");
  }
}

/**
 * Navigate to the first meter's page and wait for it to finish loading.
 */
async function navigateToFirstMeterPage() {
  // The page.goto() as well as `await page.setCacheEnabled(false)` seems to improve reliability of getting
  // to the energy usage page, but note some of the selector indices change from 1 to 0, "meter_selector_num"
  // now starts from 0 instead of 500+, and that after logging in once, you will stay logged in on other pages.
  // See `loginErrorCount` variable, and also run the scraper with `headless: false` to see the process.
  await page.goto(process.env.PP_ACCOUNTPAGE, {
    waitUntil: "networkidle0",
    timeout: 120000,
  });
  console.log(await page.title());

  // wait for the page to load
  await page.waitForSelector("#loader-temp-secure", {
    hidden: true,
    timeout: 25000,
  });

  await page.waitForFunction(
    () =>
      !document.querySelector(
        "#main > wcss-full-width-content-block > div > wcss-myaccount-dashboard > div:nth-child(4) > div:nth-child(2) > wcss-payment-card > div > wcss-loading",
      ),
  );

  await page.waitForFunction(
    () =>
      !document.querySelector(
        "#main > wcss-full-width-content-block > div > wcss-myaccount-dashboard > div:nth-child(4) > div:nth-child(1) > wcss-ma-usage-graph > div > div > wcss-loading > div",
      ),
  );
}

/**
 * Get the meter selector number from the first meter on the page to use for navigating
 * between meters (this number can change from login to login):
 * inspect element > see div with ID "#mat-option-<meter_selector_num>", e.g. "#mat-option-1"
 */
async function getMeterSelectorNumberFromFirstMeter() {
  // it's theoretically possible to get yearly result for first meter, so check just in case
  // await page.waitForTimeout(25000);
  await page.waitForFunction(
    () => !document.querySelector("#loading-component > mat-spinner"),
  );

  yearCheck = await page.$(YEAR_IDENTIFIER, { timeout: 25000 });
  monthCheck = await page.$(MONTH_IDENTIFIER, { timeout: 25000 });

  console.log("Year / Month Check found");
  if ((!yearCheck && !monthCheck) || (yearCheck && monthCheck)) {
    throw "try again";
  }

  if (yearCheck && !monthCheck) {
    graphButton = GRAPH_TO_TABLE_BUTTON_YEARLY;
  } else if (!yearCheck && monthCheck) {
    graphButton = GRAPH_TO_TABLE_BUTTON_MONTHLY;
  }

  await waitForTimeout(25000);
  await page.waitForSelector(graphButton, { timeout: 25000 });
  console.log("Graph to Table Button clicked");

  await page.click(graphButton);

  await waitForTimeout(25000);
  await page.waitForSelector(METER_MENU);

  await page.click(METER_MENU);

  await page.waitForSelector(LOADING_BACKDROP_TRANSPARENT);

  console.log("Meter Menu Opened");
  meter_selector_full = await page.$eval("mat-option", (el) =>
    el.getAttribute("id"),
  );
  meter_selector_num = parseInt(meter_selector_full.slice(11));
  first_selector_num = meter_selector_num;
  console.log("Meter ID Found");

  await page.click(METER_MENU);
  console.log("Meter Menu Closed");
  await page.waitForSelector(LOADING_BACKDROP_TRANSPARENT, { hidden: true });

  // one time pause after closing menu before the while loops, just in case
  // await page.waitForTimeout(10000);
}

// -------------------------------- Misc page navigation functions ---------------------------- //

/**
 * Wait for the top row data to load and confirm that it is monthly data.
 * Throws an error if data is not monthly, which will trigger a switch to a different timeframe
 * to try to force the data to load
 */
async function waitForTopRowDataAndConfirmItsMonthly() {
  while (!monthlyDataTopRowErrorFlag && monthlyDataTopRowError < maxAttempts) {
    try {
      await page.waitForSelector(GRAPH_SELECTOR);

      await page.waitForSelector(MONTHLY_TABLE_ROW_SELECTOR + "1)", {
        timeout: 25000,
      });

      console.log("Monthly Top Found");

      // Early throw for odd timeframeIterator values (otherwise the meter might try to read yearly etc data
      // from monthly meters)
      if (timeframeIterator % 2 === 1) {
        console.log(
          "throwing for odd timeframeIterator, not reading this value although it is valid",
        );
        throw "odd timeframeIterator";
      }

      //if no errors are thrown, break out of loop
      return;
    } catch (error) {
      // console.error(error);
      await switchTimeFrameOptionToForceDataToLoad();
    }
  }
}

/**
 * Opens the timeframe option, checks if there is a weekly option,
 * which will indicate if the data is likely monthly or yearly.
 * Clicks on the appropriate timeframe option so that it can be switched
 * back to monthly to avoid the "no data" error when there should be data.
 */
async function switchTimeFrameOptionToForceDataToLoad() {
  // TODO: Should the "Monthly Top Not Found" messages be tweaked / hidden in case of an intentional throw
  // ("throwing for odd timeframeIterator, not reading this value although it is valid")?
  console.log(`Monthly Top not found.`);

  // open up time menu and switch timeframes (month vs year etc) to avoid the "no data" (when there actually is data) glitch
  // trying to reload the page is a possibility but it's risky due to this messing with the mat-option ID's
  monthlyDataTopRowErrorFlag = true;
  await page.waitForSelector(TIME_MENU);

  await page.click(TIME_MENU);
  // await page.waitForTimeout(10000);
  await page.waitForSelector(LOADING_BACKDROP_TRANSPARENT);

  weekCheck = await page.$(WEEK_IDENTIFIER, {
    timeout: 25000,
  });

  if (weekCheck) {
    console.log("One Week Option Found, Data is probably monthly");

    // odd timeframeIterator (0,2,4, etc) = One Month
    timeframeChoices = [
      { id: YEAR_IDENTIFIER, label: "One Year" },
      { id: MONTH_IDENTIFIER, label: "One Month" },
      { id: TWO_YEAR_IDENTIFIER, label: "Two Year" },
      { id: MONTH_IDENTIFIER, label: "One Month" },
      { id: DAY_IDENTIFIER, label: "One Day" },
      { id: MONTH_IDENTIFIER, label: "One Month" },
      { id: WEEK_IDENTIFIER, label: "One Week" },
      { id: MONTH_IDENTIFIER, label: "One Month" },
    ];
  } else {
    console.log("One Week Option Not Found, Data probably yearly");

    // odd timeframeIterator (0,2,4, etc) = One Year
    timeframeChoices = [
      { id: TWO_YEAR_IDENTIFIER, label: "Two Year" },
      { id: YEAR_IDENTIFIER, label: "One Year" },
    ];
  }

  timeframeCheck = await page.$(
    timeframeChoices[timeframeIterator % timeframeChoices.length].id,
    {
      timeout: 25000,
    },
  );
  if (timeframeCheck) {
    console.log(
      timeframeChoices[timeframeIterator % timeframeChoices.length].label +
        " Found",
    );
    await timeframeCheck.click();
    console.log(
      timeframeChoices[timeframeIterator % timeframeChoices.length].label +
        " Clicked",
    );
  } else {
    console.log(
      timeframeChoices[timeframeIterator % timeframeChoices.length].label +
        " Not Found",
    );

    // Monthly meters have 2 year, 1 year, 1 month, 1 week, 1 day
    // Yearly meters have 2 year, 1 year
    // So every meter's timeframe options *should* be accounted for, but just in case, we have a break statement here
    console.log("Some Other Issue");
  }
}

// -------------------------------- Meter processing functions ---------------------------- //

/**
 * Compares the given meter against the exclusion list to determine if its data
 * should be uploaded to the database. If the meter is not found in the list,
 * it is considered a new meter and is added to the exclusion list with "new" status.
 * New and included meters will have their data uploaded to the database.
 *
 */
function compareMeterAgainstExclusionList(PPTable) {
  const meter = pp_meters_exclusion_list.find(
    (meter) => meter.pp_meter_id === PPTable.pp_meter_id,
  );

  if (!meter) {
    console.log(
      `Meter ${PPTable.pp_meter_id} is not in the exclusion list: NEW METER`,
    );
    // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
    if (!pp_meters_exclude_not_found.includes(PPTable.pp_meter_id)) {
      pp_meters_exclude_not_found.push(PPTable.pp_meter_id);
    }
    return;
  } else
    switch (meter.status) {
      case "exclude":
        console.log(`Meter ${PPTable.pp_meter_id} is excluded from db`);
        // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
        if (!pp_meters_exclude.includes(PPTable.pp_meter_id)) {
          pp_meters_exclude.push(PPTable.pp_meter_id);
        }
        break;
      case "include":
        console.log(`Meter ${PPTable.pp_meter_id} is included in db`);
        pp_meters_include.push(PPTable.pp_meter_id);
        // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
        if (!pp_meters_include.includes(PPTable.pp_meter_id)) {
          pp_meters_include.push(PPTable.pp_meter_id);
        }
        break;
      case "new":
        console.log(
          `Meter ${PPTable.pp_meter_id} status needs updating, include in db for now.`,
        );
        // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
        if (!pp_meters_include.includes(PPTable.pp_meter_id)) {
          pp_meters_include.push(PPTable.pp_meter_id);
        }
        break;
      default:
        console.log(`Meter ${PPTable.pp_meter_id} unrecognized status`);
    }

  // add meter to upload queue if it's not excluded
  if (
    !pp_meters_exclude.includes(PPTable.pp_meter_id) &&
    (pp_meters_include.includes(PPTable.pp_meter_id) ||
      pp_meters_exclude_not_found.includes(PPTable.pp_meter_id))
  ) {
    // should only be logged for valid, unique data objects not in exclusion list
    console.log("Valid data found for this day found; queuing upload.");
    PPArray.push(PPTable);
  }
}

/**
 * Select a meter from the dropdown menu.
 */
async function selectMeterFromDropdownMenu() {
  await page.waitForSelector(LOADING_BACKDROP_TRANSPARENT, { hidden: true });

  await page.click(METER_MENU);
  console.log("Meter Menu Opened");

  // await page.waitForTimeout(10000);
  await page.waitForSelector(LOADING_BACKDROP_TRANSPARENT);

  await page.waitForSelector(
    "#" + meter_selector_full.slice(0, 11) + meter_selector_num.toString(),
  );
  console.log("New Meter Opened");

  await page.click(
    "#" + meter_selector_full.slice(0, 11) + meter_selector_num.toString(),
  );
}

/**
 * Handle the loading screen that appears when switching between meters.
 */
async function handleMeterLoadingScreen() {
  while (!continueLoadingFlag && loadingScreenErrorCount === 0) {
    try {
      await page.waitForSelector(LOADING_BACKDROP_DARK, { timeout: 25000 });
      console.log("Loading Screen Found");
      break;
    } catch (error) {
      // console.error(error);
      console.log(`Loading Screen not found.`);
      continueLoadingFlag = true;
    }
  }

  if (continueLoadingFlag) {
    console.log("Loading Screen not found, trying again");
    continueLoadingFlag = false;
    loadingScreenErrorCount++;

    // throwing the error will prompt a retry (in the form of continuing the while loop)
    throw new Error("Retrying due to loading screen not found");
  }

  continueLoadingFlag = false;

  // https://stackoverflow.com/questions/58833640/puppeteer-wait-for-element-disappear-or-remove-from-dom
  if (loadingScreenErrorCount === 0) {
    await page.waitForSelector(LOADING_BACKDROP_DARK, { hidden: true });
  }
}

/**
 * Get the meter ID from the meter dropdown menu text, e.g.
 * "1234 NE ELECTRIC RD CORVALLIS OR (Item #123) (Meter #1234567)"
 * returns the meter ID 1234567.
 */
async function getMeterIdFromMeterMenu() {
  const pp_meter_element = await page.waitForSelector(METER_MENU);
  const pp_meter_full = await pp_meter_element.evaluate((el) => el.textContent);

  let pp_meter_full_trim = pp_meter_full.trim();
  console.log(pp_meter_full_trim);

  let positionMeter = "(Meter #";
  let meterStringIndex = pp_meter_full_trim.indexOf(positionMeter);
  meter_id = parseInt(
    pp_meter_full_trim.slice(
      meterStringIndex + 8,
      pp_meter_full_trim.length - 2,
    ),
  );

  return meter_id;
}

/**
 * Check upload queue for duplicate meter/time data.
 */
function lookForDuplicateDataInPPArray(date, actualDate, END_TIME_SECONDS) {
  upload_queue_matching_time = PPArray.find(
    (o) =>
      String(o.pp_meter_id) === String(pp_meter_id) &&
      String(o.time_seconds) === String(END_TIME_SECONDS),
  );

  if (pp_recent_data) {
    pp_recent_filtered = pp_recent_data.filter(
      (o) => String(o.pacific_power_meter_id) === String(pp_meter_id),
    );

    let closestMatch = 864000; // 10 days in seconds initial value, which should be higher than the 7 day threshold
    for (let i = 0; i < pp_recent_filtered.length; i++) {
      if (
        Number(END_TIME_SECONDS) >= Number(pp_recent_filtered[i].time_seconds)
      ) {
        if (
          Number(END_TIME_SECONDS) -
            Number(pp_recent_filtered[i].time_seconds) <
          closestMatch
        ) {
          closestMatch =
            Number(END_TIME_SECONDS) -
            Number(pp_recent_filtered[i].time_seconds);
          pp_recent_matching = pp_recent_filtered[i];
        }
      }
    }

    pp_recent_matching_time = moment
      .tz(
        pp_recent_matching.time_seconds * 1000, // moment.tz expects milliseconds
        "America/Los_Angeles",
      )
      .format("YYYY-MM-DD");
  }

  console.log("Actual date: " + actualDate);
  console.log("Date shown on Pacific Power site: " + date.toString());

  if (date && date !== actualDate) {
    console.log("Actual date and date on pacific power site are out of sync.");
  } else if (date && date === actualDate) {
    console.log("Actual date and date on pacific power site are in sync.");
  }

  if (pp_recent_data) {
    if (pp_recent_matching) {
      console.log(
        "Latest matching date from SQL database (relative to pacific power site): " +
          pp_recent_matching_time,
      );
    } else {
      console.log("No matching data for this day found yet in SQL database");
    }
    if (pp_recent_matching_time && pp_recent_matching_time === actualDate) {
      console.log(
        "Data for this day already exists in SQL database, skipping upload, going to next day",
      );
    }
  }
}

/**
 * This function handles the highest level error for a meter
 */
function handleUnkownMeterError(error) {
  console.error(error);
  otherErrorArray.push({ meter_selector_num, pp_meter_id });
  console.log(
    meter_selector_num.toString() + " Unknown Issue, Skipping to next meter",
  );

  // In general, timeframeIterator should be reset on every exit path for the current meter ID
  // (unlike some other flags that keep track of number of errors, that we may want to persist between different meters)
  timeframeIterator = 0;
  meter_selector_num++;
  meterErrorCount++;
  if (meterErrorCount === maxAttempts) {
    console.log(`Re-Checked ${maxAttempts} times, Stopping Webscraper`);
  }
}

// -------------------------------- Misc helper functions ---------------------------- //

/**
 * This is a replacement for Puppeteer's deprecated waitForTimeout function.
 * It's not best practice to use this, so try to favor waitForSelector/Locator/etc.
 */
async function waitForTimeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRowText(monthly_top_const, row_days) {
  monthly_top = await page.waitForSelector(monthly_top_const + row_days + ")");
  monthly_top_text = await monthly_top.evaluate((el) => el.textContent);
  return monthly_top_text;
}

function getActualDate(num_days) {
  // reference (get time in any timezone and string format): https://momentjs.com/timezone/docs/
  // yesterday's date in PST timezone, YYYY-MM-DD format
  let actualDate = moment
    .tz(
      new Date(new Date().getTime() - num_days * 24 * 60 * 60 * 1000),
      "America/Los_Angeles",
    )
    .format("YYYY-MM-DD");
  const actualDateObj = new Date(actualDate);

  // unix time calc
  actualDateObj.setUTCHours(23, 59, 59, 0);
  const ACTUAL_DATE_UNIX = Math.floor(
    actualDateObj.valueOf() / 1000,
  ).toString();
  return { actualDate, ACTUAL_DATE_UNIX };
}

async function getRowData(monthly_top_text, positionUsage, positionEst) {
  let usage_kwh = parseFloat(
    monthly_top_text.split(positionUsage)[1].split(positionEst)[0],
  );

  // get the date for the data
  let positionPeriod = "Period";
  let positionAve = "Average";
  let date = monthly_top_text.split(positionPeriod)[1].split(positionAve)[0];

  const dateObj = new Date(date);
  const END_TIME = `${date}T23:59:59`;

  // unix time calc
  dateObj.setUTCHours(23, 59, 59, 0);
  const END_TIME_SECONDS = Math.floor(dateObj.valueOf() / 1000).toString();
  return { usage_kwh, date, END_TIME, END_TIME_SECONDS };
}

/**
 * Prints out the final results of the meter data processing.
 * This includes the unavailable, delivered error, yearly, and
 * other error meters.
 */
function printFinalArraysResults() {
  if (unAvailableErrorArray.length > 0) {
    console.log("\nUnavailable Meters (Monthly): ");
    for (let i = 0; i < unAvailableErrorArray.length; i++) {
      console.log(unAvailableErrorArray[i]);
    }
  }
  if (deliveredErrorArray.length > 0) {
    console.log("\nDelivered Error Meters (Monthly): ");
    for (let i = 0; i < deliveredErrorArray.length; i++) {
      console.log(deliveredErrorArray[i]);
    }
  }
  if (yearlyArray.length > 0) {
    console.log("\nYearly Meters: ");
    for (let i = 0; i < yearlyArray.length; i++) {
      console.log(yearlyArray[i]);
    }
  }
  if (otherErrorArray.length > 0) {
    console.log("\nOther Errors: ");
    for (let i = 0; i < otherErrorArray.length; i++) {
      console.log(otherErrorArray[i]);
    }
  }

  if (pp_meters_exclude.length > 0) {
    console.log("\nMeters Excluded: ");
    for (let i = 0; i < pp_meters_exclude.length; i++) {
      console.log(pp_meters_exclude[i]);
    }
  }

  if (pp_meters_include.length > 0) {
    console.log("\nMeters Included in DB: ");
    for (let i = 0; i < pp_meters_include.length; i++) {
      console.log(pp_meters_include[i]);
    }
  }

  if (pp_meters_exclude_not_found.length > 0) {
    console.log("\nMeters Not Found in Exclusion List (new meters): ");
    for (let i = 0; i < pp_meters_exclude_not_found.length; i++) {
      console.log(pp_meters_exclude_not_found[i]);
    }
  }
}

/**
 * Saves the various arrays to a JSON file.
 * This includes the unavailable, delivered error, yearly, and
 * other error meters, as well as the meters excluded/included/not found
 * in the database.
 */
function saveOutputToFile() {
  PPArray.push("Unavailable Meters (Monthly): ");
  PPArray.push(unAvailableErrorArray);
  PPArray.push("Delivered Error Meters (Monthly): ");
  PPArray.push(deliveredErrorArray);
  PPArray.push("Yearly Meters: ");
  PPArray.push(yearlyArray);
  PPArray.push("Other Errors: ");
  PPArray.push(otherErrorArray);
  PPArray.push("Meters Excluded from DB: ");
  PPArray.push(pp_meters_exclude);
  PPArray.push("Meters Included in DB: ");
  PPArray.push(pp_meters_include);
  PPArray.push("Meters Not Found in Exclusion List (new meters): ");
  PPArray.push(pp_meters_exclude_not_found);
  const jsonContent = JSON.stringify(PPArray, null, 2);
  fs.writeFile("./output.json", jsonContent, "utf8", function (err) {
    if (err) {
      return console.log(err);
    }
    console.log("\nFile Saved: Yes");
  });
}

// -------------------------------- Energy Dashboard API functions ---------------------------- //

/**
 * Uploads any new meters to the database.
 */
async function addNewMetersToDatabase() {
  for (let i = 0; i < pp_meters_exclude_not_found.length; i++) {
    await axios({
      method: "post",
      url: `${DASHBOARD_API}/ppupload`,
      data: {
        id: pp_meters_exclude_not_found[i],
        pwd: process.env.API_PWD,
      },
    })
      .then((res) => {
        console.log(`\nRESPONSE: ${res.status}, TEXT: ${res.statusText}`);
        if (res.status === 200) {
          console.log(
            `${pp_meters_exclude_not_found[i]} uploaded to database.`,
          );
        }
      })
      .catch((err) => {
        console.log(err);
      });
  }
}

/**
 * Retrieve the most recent data from the Pacific Power Recent Data List.
 * Used to avoid uploading redundant data to the database and for uploading
 * missing data. /pprecent API currently returns the last 7 days of data.
 */
async function getPacificPowerRecentData() {
  let recent_data = await axios({
    method: "get",
    url: `${DASHBOARD_API}/pprecent`,
  })
    .then((res) => {
      // DEBUG: change to test specific status codes from API
      if (res.status < 200 || res.status >= 300) {
        throw new Error("Failed to fetch PP Recent Data List");
      }

      console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}`);
      return res.data;
    })
    .catch((err) => {
      console.log(err);
    });

  if (recent_data) {
    console.log(
      `${recent_data.length} total datapoints in PP Recent Data List (no duplicates)`,
    );
    const uniqueIds = new Set();
    recent_data.forEach((item) => {
      uniqueIds.add(item.pacific_power_meter_id);
    });
    const numberOfUniqueIds = uniqueIds.size;
    console.log(
      `${numberOfUniqueIds} unique meter ID's in PP Recent Data List`,
    );
  } else {
    console.log(
      "Could not get PP Recent Data List. Redundant data (same meter ID and timestamp as an existing value) might be uploaded to SQL database.",
    );
  }

  return recent_data;
}

/**
 * Retrieve the Pacific Power Meter Exclusion List from the database.
 * Meters will have status of 'exclude', 'include', or 'new'.
 * 'exclude' meters will not have their data uploaded to the database,
 * 'include' and 'new' meters will.
 */
async function getPacificPowerMeterExclusionList() {
  let exclusion_list = await axios({
    method: "get",
    url: `${DASHBOARD_API}/ppexclude`,
  })
    .then((res) => {
      // DEBUG: change to test specific status codes from API
      if (res.status < 200 || res.status >= 300) {
        throw new Error("Failed to fetch PP Meter Exclusion List");
      }

      console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}`);
      return res.data;
    })
    .catch((err) => {
      console.log(err);
    });

  if (exclusion_list) {
    console.log(`${exclusion_list.length} meters in PP Meter Exclusion List`);
  } else {
    console.log(
      "Could not get PP Meter Exclusion List. All meter data will be uploaded.",
    );
  }

  return exclusion_list;
}

/**
 * Uploads the meter data to the database, logs response.
 */
async function uploadDatatoDatabase(meterData) {
  const pacificPowerMeters = "pacific_power_data";

  await axios({
    method: "post",
    url: `${DASHBOARD_API}/upload`,
    data: {
      id: pacificPowerMeters,
      body: meterData,
      pwd: process.env.API_PWD,
      type: "pacific_power",
    },
  })
    .then((res) => {
      console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}`);
      if (res.status === 200) {
        console.log(`${meterData.pp_meter_id} uploaded to database.`);
      }
    })
    .catch((err) => {
      if (
        err.response.status === 400 &&
        err.response.data === "redundant upload detected, skipping"
      ) {
        console.log(
          `RESPONSE: ${err.response.status}, TEXT: ${err.response.statusText}, ERROR: ${err.response.data}`,
        );
      } else {
        console.log(err);
      }
    });
}

// -------------------------------- Top Level functions ---------------------------- //

/**
 * Main function to get meter data from the Pacific Power website. Loops through all
 * meters in the meter dropdown menu that have data available.
 */
async function getMeterData() {
  // DEBUG: testing at specific meter ID, e.g. to see if termination behavior works
  // meter_selector_num = 110;

  while (!meterErrorsFlag && meterErrorCount < maxAttempts) {
    try {
      console.log("\n" + meter_selector_num.toString());

      // After the first time a loading screen is detected, don't need to open meter menu again (for current meter ID)
      if (loadingScreenErrorCount === 0) {
        await selectMeterFromDropdownMenu();
      }

      // if we're past the first meter, we need to wait for the loading screen to disappear
      if (first_selector_num !== meter_selector_num) {
        try {
          await handleMeterLoadingScreen();
        } catch (err) {
          // an error occurred with the loading screen, try again
          continue;
        }
      }

      // Get Pacific Power Meter ID
      pp_meter_id = await getMeterIdFromMeterMenu();
      console.log("PP Meter ID: " + pp_meter_id.toString());

      // Check if top row monthly data is available
      await waitForTopRowDataAndConfirmItsMonthly();

      // This increases in value every time we try to read a given meter's data (assuming scraper got past loading screen check)
      timeframeIterator++;
      if (monthlyDataTopRowErrorFlag) {
        // TODO: Should the "Monthly Top Not Found" messages be tweaked / hidden in case of an intentional throw
        // ("throwing for odd timeframeIterator, not reading this value although it is valid")?
        console.log("Monthly Top not found, try again");
        console.log(
          "Attempt " +
            (monthlyDataTopRowError + 1).toString() +
            " of " +
            maxAttempts,
        );
        monthlyDataTopRowError++;
        if (monthlyDataTopRowError === maxAttempts) {
          console.log(`Re-Checked ${maxAttempts} times, Stopping Webscraper`);
          meterErrorsFlag = true;
          break;
        }
        monthlyDataTopRowErrorFlag = false;
        continue;
      }

      // Always reset row_days (for each meter ID) to 1 (or whatever is default value) before checking past week's data
      let row_days = row_days_const;
      monthly_top_text = await getRowText(MONTHLY_TABLE_ROW_SELECTOR, row_days);

      // TODO in future PR: Fix this variable name to be just "top row" or something,
      // rename "monthly" var names to be more clear on time interval vs total time frame
      console.log("Monthly Data Top Row Found, getting table top row value");
      let positionUsage = "Usage(kwh)"; // You can edit this value to something like "Usage(kwhdfdfd)" to test the catch block at the end
      let positionEst = "Est. Rounded";

      // Custom breakpoint for testing
      /*
      if (meter_selector_num === 10) {
        meterErrorsFlag = true;
        break;
      }
      */

      if (monthly_top_text.includes(positionEst)) {
        console.log("Data is not yearly. Data is probably monthly.");
        console.log("===");
        console.log(monthly_top_text);
      } else {
        console.log("Year Check Found, skipping to next meter");
        console.log("===");
        console.log(monthly_top_text);

        // TODO (future PR with Cloudwatch): Some kind of check here if the yearly meter is in inclusion list, and if
        // so, log an error?
        // "'Yearly Meter type' Valid Data detected scenario" exit path here, reset flags
        yearlyArray.push({ meter_selector_num, pp_meter_id });
        meter_selector_num++;
        loadingScreenErrorCount = 0;
        timeframeIterator = 0;
        continue;
      }

      // The point of monthlyDataTopRowError is to keep track of number of retries
      // needed before valid data is detected, so this variable is reset as long as valid data was detected, regardless
      // of if the meter was monthly or yearly type
      monthlyDataTopRowErrorFlag = false;
      monthlyDataTopRowError = 0;

      // Always reset actual_days (for each meter ID) to 1 (or whatever is default value) before checking past week's data
      let actual_days = actual_days_const;

      while (!prevDayFlag && actual_days <= maxPrevDayCount) {
        try {
          try {
            monthly_top_text = await getRowText(
              MONTHLY_TABLE_ROW_SELECTOR,
              row_days,
            );
          } catch (error) {
            console.log(
              `Meter data for ${actual_days} days ago not found on pacific power site, likely due to this being a new meter. Exiting early.`,
            );
            console.error(error);
            prevDayFlag = true;
          }

          // Check upload queue (PPArray) for data that matches meter ID (does NOT check for matching time value).
          // TODO in future PR: Rename PPArray and other variables to have clearer meaning
          upload_queue_matching = PPArray.find(
            (o) => String(o.pp_meter_id) === String(pp_meter_id),
          );
          if (upload_queue_matching && !pp_recent_data) {
            console.log(
              "Due to the ppRecent API call returning an error, exiting early after queuing at least 1 day's worth of data to be uploaded (to reduce redundant uploads).",
            );
            prevDayFlag = true;
            break;
          }
          if (actual_days > actual_days_const) {
            console.log(
              "Monthly Data Top Row Found, getting table top row value",
            );
            console.log("===");
            console.log(monthly_top_text);
          }

          if (monthly_top_text.includes("Unavailable")) {
            console.log(
              "'Unavailable' error detected for monthly time range, skipping to next day",
            );
            row_days += 1;
            actual_days += 1;
            unAvailableErrorArray.push({
              meter_selector_num,
              pp_meter_id,
            });
            continue;
          }

          if (
            monthly_top_text.includes("delivered to you") ||
            monthly_top_text.includes("received from you")
          ) {
            console.log(
              "'delivered / received' error detected for monthly time range, skipping to next day",
            );
            row_days += 1;
            actual_days += 1;
            deliveredErrorArray.push({
              meter_selector_num,
              pp_meter_id,
            });
            continue;
          }

          let { usage_kwh, date, END_TIME, END_TIME_SECONDS } =
            await getRowData(monthly_top_text, positionUsage, positionEst);
          let actualDate = getActualDate(actual_days).actualDate;

          // Check upload queue (PPArray) for data that matches meter ID AND time, before uploading.
          // TODO in future PR: Rename PPArray and other variables to have clearer meaning
          lookForDuplicateDataInPPArray(date, actualDate, END_TIME_SECONDS);

          PPTable = {
            meter_selector_num,
            pp_meter_id,
            usage_kwh,
            time: END_TIME,
            time_seconds: END_TIME_SECONDS,
          };

          // If recent data list was fetched, verify there are no matching meter ID + time_seconds values in SQL
          // database, nor in upload queue (PPTable).
          // If recent data list wasn't fetched, still verify there are no matching meter ID + time_seconds values
          // in upload queue (PPTable).
          if (
            ((pp_recent_matching &&
              String(pp_recent_matching.time_seconds) !== END_TIME_SECONDS) ||
              !pp_recent_matching) &&
            !upload_queue_matching_time
          ) {
            // if exclusion list was fetched, compare the meter against it to exclude meters
            // otherwise we will add all meter data to db
            if (pp_meters_exclusion_list) {
              compareMeterAgainstExclusionList(PPTable);
            } else {
              PPArray.push(PPTable);
              // should only be logged for valid, unique data objects not in exclusion list
              console.log(
                "Valid data found for this day found; queuing upload.",
              );
            }
          }

          if (actual_days === maxPrevDayCount) {
            console.log(
              `Reached max day count of ${maxPrevDayCount} days, exiting`,
            );
            prevDayFlag = true;
            break;
          }
          if (date && date !== actualDate) {
            console.log(
              "Now going back 1 more day (actual date), let's see if that syncs us up with date from Pacific Power site",
            );
            actual_days += 1;
            let ACTUAL_DATE_UNIX = getActualDate(actual_days).ACTUAL_DATE_UNIX;
            if (ACTUAL_DATE_UNIX === END_TIME_SECONDS) {
              console.log(
                "Synced actual date and date from Pacific Power site, go to equalled if loop",
              );
              continue;
            }
          } else if (date && date === actualDate) {
            row_days += 1;
            actual_days += 1;
          }
        } catch (error) {
          console.log("Some other error occurred, skipping to next meter");
          console.error(error);
          otherErrorArray.push({ meter_selector_num, pp_meter_id });
          prevDayFlag = true;
        }
      }
      prevDayFlag = false;

      // If "Est. Rounded" is found, then the data is monthly.
      // "Best Case Scenario" (valid data from 'Monthly' meter type) exit path here, reset flags
      if (monthly_top_text.includes(positionEst)) {
        meter_selector_num++;
        loadingScreenErrorCount = 0;
        timeframeIterator = 0;
      }
    } catch (error) {
      // This catch ensures that if one meter errors out, we can keep going to next meter instead of whole webscraper crashing
      handleUnkownMeterError(error);
    }
  }
}

(async () => {
  pp_recent_data = await getPacificPowerRecentData();
  pp_meters_exclusion_list = await getPacificPowerMeterExclusionList();

  // Launch the browser
  const browser = await puppeteer.launch({
    // DEBUG: use --headful flag (node readPP.js --headful), browser will be visible
    // reference: https://developer.chrome.com/articles/new-headless/
    headless: process.argv.includes("--headful") ? false : "new",
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Login and get meter selector number (needed for navigating between meters)
  while (attemptLoginFlag && loginErrorCount < maxAttempts) {
    try {
      // Create a page
      page = await browser.newPage();
      await page.setDefaultTimeout(TIMEOUT_BUFFER);
      await page.setCacheEnabled(false);
      await page.reload({ waitUntil: "networkidle2" });

      // Sign in and get meter selector number for meter navigation
      await signInToPacificPower();
      await navigateToFirstMeterPage();
      await getMeterSelectorNumberFromFirstMeter();

      // flag / variables below are reset after successfully getting to the first meter's page
      console.log("\nLogs are recurring after this line");
      attemptLoginFlag = false;
      loginErrorCount = 0;
      loginSuccessFlag = true;
    } catch (err) {
      console.error(err);
      console.log(
        `Unknown Issue en route to Energy Usage Page, (Attempt ${
          loginErrorCount + 1
        } of ${maxAttempts}). Retrying...`,
      );
      loginErrorCount++;
      if (loginErrorCount === maxAttempts) {
        console.log(`Re-Checked ${maxAttempts} times, Stopping Webscraper`);
        attemptLoginFlag = false;
        break;
      }
      attemptLoginFlag = true;
    }
  }

  if (loginSuccessFlag) {
    await getMeterData();
  }

  // log all data to be uploaded
  if (PPArray.length > 0) {
    console.log("\nData to be uploaded: ");
  } else if (PPArray.length === 0) {
    console.log("\nNo data to be uploaded, SQL database is already up to date");
  }

  for (let i = 0; i < PPArray.length; i++) {
    console.log(PPArray[i]);

    // to prevent uploading data to API: node readPP.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await uploadDatatoDatabase(PPArray[i]);
    }
  }

  console.log(
    "\nTimestamp (approximate): " +
      moment
        .unix(startDate)
        .tz("America/Los_Angeles")
        .format("MM-DD-YYYY hh:mm a") +
      " PST",
  );

  // print final results of arrays (meters with errors, meters excluded, etc)
  printFinalArraysResults();

  // add new meters to exclusion table in database if uploading
  if (!process.argv.includes("--no-upload")) {
    await addNewMetersToDatabase();
  }

  // node readPP.js --save-output
  if (
    process.argv.includes("--save-output") ||
    process.env.SAVE_OUTPUT === "true"
  ) {
    saveOutputToFile();
  }

  // Close browser.
  await browser.close();
})();
