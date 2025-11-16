// Pacific Power Web Scraper

// total runtime with current parameters: As fast as 4 minutes not counting last noData checks, or 9 minutes with noData checks

// The various timeouts and while loops + try/catch blocks on this page are probably overkill, but the errors seem to show up at
// random (based on Internet speed etc), so better safe than sorry for production. You can lower the timeouts for debug.

// Misc Constants / imports
const puppeteer = require("puppeteer");
const moment = require("moment-timezone");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

// ================================
// CONFIGURATION & CONSTANTS
// ================================

const CONFIG = {
  // Timeouts and retry settings
  TIMEOUT_BUFFER: 1200000, // 20 minutes
  MAX_ATTEMPTS: 8, // needs to be at least 8 because we check 8 timeframes (monthly): [2 year, 1 month, 1 year, 1 month, 1 day, 1 month, 1 week, 1 month]
  MAX_PREV_DAY_COUNT: 7, // Maximum number of days back to check data for each meter

  // Date settings
  STARTING_DAYS_BACK: 1, // How many days back from today to start checking data
  STARTING_TABLE_ROW: 1, // Which table row to start reading from (1 = most recent day)

  // API settings
  DASHBOARD_API: process.argv.includes("--local-api")
    ? process.env.LOCAL_API
    : process.env.DASHBOARD_API,
};

// Pacific Power Selectors
const SELECTORS = {
  ACCEPT_COOKIES: "button.cookie-accept-button",
  LOCATION_BUTTON: "a.modalCloseButton",
  SIGN_IN_PAGE_BUTTON: "a.link.link--default.link--size-default.signin",
  SIGN_IN_IFRAME: 'iframe[src="/oauth2/authorization/B2C_1A_PAC_SIGNIN"]',
  SIGN_IN_INPUT: "input#signInName",
  SIGN_IN_PASSWORD: "input#password",
  LOGIN_BUTTON: "button#next",
  LOADING_BACKDROP_TRANSPARENT:
    "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing",
  LOADING_BACKDROP_DARK:
    "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing",
  // The next two selectors below correspond to a button that converts line graph data on PacificPower to table format
  GRAPH_TO_TABLE_BUTTON_MONTHLY:
    "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(3) > img",
  GRAPH_TO_TABLE_BUTTON_YEARLY:
    "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div > a:nth-child(3) > img",
  METER_MENU: "#mat-select-1 > div > div.mat-select-value > span",
  TIME_MENU: "#mat-select-2 > div > div.mat-select-value > span",
  YEAR_IDENTIFIER: "span ::-p-text(One Year)",
  MONTH_IDENTIFIER: "span ::-p-text(One Month)",
  WEEK_IDENTIFIER: "span ::-p-text(One Week)",
  TWO_YEAR_IDENTIFIER: "span ::-p-text(Two Year)",
  DAY_IDENTIFIER: "span ::-p-text(One Day)",
  GRAPH_SELECTOR:
    "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area",
  // Selector below corresponds to monthly meter data table, add row number to get specific row data (e.g. + "1)" for first row of data)
  MONTHLY_TABLE_ROW_SELECTOR:
    "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(",
};

// Map of timeframe choices for monthly and yearly data
const TIMEFRAME_CHOICES = {
  MONTHLY: [
    { id: SELECTORS.YEAR_IDENTIFIER, label: "One Year" },
    { id: SELECTORS.MONTH_IDENTIFIER, label: "One Month" },
    { id: SELECTORS.TWO_YEAR_IDENTIFIER, label: "Two Year" },
    { id: SELECTORS.MONTH_IDENTIFIER, label: "One Month" },
    { id: SELECTORS.DAY_IDENTIFIER, label: "One Day" },
    { id: SELECTORS.MONTH_IDENTIFIER, label: "One Month" },
    { id: SELECTORS.WEEK_IDENTIFIER, label: "One Week" },
    { id: SELECTORS.MONTH_IDENTIFIER, label: "One Month" },
  ],
  YEARLY: [
    { id: SELECTORS.TWO_YEAR_IDENTIFIER, label: "Two Year" },
    { id: SELECTORS.YEAR_IDENTIFIER, label: "One Year" },
  ],
};

// ================================
// UTILITY FUNCTIONS
// ================================

// Date-related helper functions
class DateUtils {
  /* Returns the date for today minus the number of days specified in two formats:
   * {
   *   actualDate: '2021-10-07',
   *   ACTUAL_DATE_UNIX: '1633622399',
   * }
   */
  static getActualDate(numDays) {
    // get the actual date
    const actualDate = moment
      .tz(Date.now() - numDays * 24 * 60 * 60 * 1000, "America/Los_Angeles")
      .format("YYYY-MM-DD");

    const endOfDayTime = actualDate + "T23:59:59"; // always set to 11:59:59 PM (PST)
    const unixTime = moment.tz(endOfDayTime, "America/Los_Angeles").unix(); // END_TIME in seconds (PST)

    return {
      actualDate,
      actualDateUnix: unixTime,
    };
  }

  /**
   * Parameters:
   * - date: Date string (e.g. "2021-10-07")
   * Returns an object of date in two formats:
   * {
   *    END_TIME: '2021-10-07T23:59:59',
   *    END_TIME_SECONDS: '1633622399',
   * }
   */
  static formatDateAndTime(date) {
    const [YEAR, MONTH, DAY] = date.split("-");
    const dateTime = `${YEAR}-${MONTH}-${DAY}T23:59:59`; // always set to 11:59:59 PM (PST)
    const unixTime = moment.tz(dateTime, "America/Los_Angeles").unix(); // END_TIME in seconds (PST)

    return {
      END_TIME: dateTime,
      END_TIME_SECONDS: unixTime,
    };
  }

  /**
   * Check if the date is in sync with the Pacific Power site.
   */
  static isMatchingDate(date, actualDate) {
    if (date !== actualDate) {
      console.log(
        "Actual date and date on pacific power site are out of sync.",
      );
      console.log(`Pacific Power Data: ${actualDate}, Actual Date: ${date}`);
    }
    return date === actualDate;
  }
}

// Data validation helper functions
class ValidationUtils {
  /**
   * Check if the meterId and corresponding time is already in the database.
   */
  static isMeterInDatabase(meterId, timeSeconds, recentData) {
    const meterInDatabase = recentData.find(
      (o) =>
        String(o.pacific_power_meter_id) === String(meterId) &&
        String(o.time_seconds) === String(timeSeconds),
    );
    if (meterInDatabase) {
      console.log(
        "Data for this day already exists in SQL database. Skipping...",
      );
    }
    return meterInDatabase;
  }

  /**
   * Check if the meterId and corresponding time is already in the upload queue.
   */
  static isMeterInUploadQueue(meterId, timeSeconds, uploadQueue) {
    const meterInQueue = uploadQueue.find(
      (o) =>
        String(o.pp_meter_id) === String(meterId) &&
        String(o.time_seconds) === String(timeSeconds),
    );
    if (meterInQueue) {
      console.log(
        "Data for this day already exists in upload queue. Skipping...",
      );
    }
    return meterInQueue;
  }
}

// ================================
// API CLIENT CLASS
// ================================

class APIClient {
  constructor(dashboardApi) {
    this.dashboardApi = dashboardApi;
  }

  /**
   * Retrieve the most recent data from the Pacific Power Recent Data List.
   * Used to avoid uploading redundant data to the database and for uploading
   * missing data. /pprecent API currently returns the last 7 days of data.
   */
  async getPacificPowerRecentData() {
    try {
      const response = await axios({
        method: "get",
        url: `${this.dashboardApi}/pprecent`,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error("Failed to fetch PP Recent Data List");
      }

      if (response.data) {
        const uniqueIds = new Set();
        response.data.forEach((item) => {
          uniqueIds.add(item.pacific_power_meter_id);
        });
        console.log(
          `${response.data.length} datapoints fetched from PP Recent Data List (${uniqueIds.size} unique meter IDs)`,
        );
      }

      return response.data;
    } catch (error) {
      console.log(error);
      console.log(
        "Could not get PP Recent Data List. Redundant data might be uploaded to SQL database.",
      );
      return null;
    }
  }

  /**
   * Retrieve the Pacific Power Meter Exclusion List from the database.
   * Meters will have status of 'exclude', 'include', or 'new'.
   * 'exclude' meters will not have their data uploaded to the database,
   * 'include' and 'new' meters will.
   */
  async getPacificPowerMeterExclusionList() {
    try {
      const response = await axios({
        method: "get",
        url: `${this.dashboardApi}/ppexclude`,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error("Failed to fetch PP Meter Exclusion List");
      }

      if (response.data) {
        console.log(
          `${response.data.length} meters fetched from PP Meter Exclusion List`,
        );
      } else {
        console.log(
          "Could not get PP Meter Exclusion List. All meter data will be uploaded.",
        );
      }

      return response.data;
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  /**
   * Uploads the meter data to the database, logs response.
   */
  async uploadDataToDatabase(meterData) {
    const pacificPowerMeters = "pacific_power_data";

    try {
      const response = await axios({
        method: "post",
        url: `${this.dashboardApi}/upload`,
        data: {
          id: pacificPowerMeters,
          body: meterData,
          pwd: process.env.API_PWD,
          type: "pacific_power",
        },
      });

      console.log(`RESPONSE: ${response.status}, TEXT: ${response.statusText}`);
      if (response.status === 200) {
        console.log(`${meterData.pp_meter_id} uploaded to database.`);
      }
    } catch (error) {
      if (
        error.response?.status === 400 &&
        error.response?.data === "redundant upload detected, skipping"
      ) {
        console.log(
          `RESPONSE: ${error.response.status}, TEXT: ${error.response.statusText}, ERROR: ${error.response.data}`,
        );
      } else {
        console.log(error);
      }
    }
  }

  /**
   * Uploads any new meters to the database.
   */
  async addNewMetersToDatabase(newMeters) {
    for (const meterId of newMeters) {
      try {
        const response = await axios({
          method: "post",
          url: `${this.dashboardApi}/ppupload`,
          data: {
            id: meterId,
            pwd: process.env.API_PWD,
          },
        });

        console.log(
          `\nRESPONSE: ${response.status}, TEXT: ${response.statusText}`,
        );
        if (response.status === 200) {
          console.log(`${meterId} uploaded to database.`);
        }
      } catch (error) {
        console.log(error);
      }
    }
  }
}

// ================================
// METER PROCESSOR CLASS
// ================================

class MeterProcessor {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.ppArray = [];
    this.unavailableErrorArray = [];
    this.deliveredErrorArray = [];
    this.otherErrorArray = [];
    this.yearlyArray = [];
    this.ppMetersExclude = [];
    this.ppMetersInclude = [];
    this.ppMetersExcludeNotFound = [];
  }

  /**
   * Compares the given meter against the exclusion list to determine if its data
   * should be uploaded to the database. If the meter is not found in the list,
   * it is considered a new meter and is added to the exclusion list with "new" status.
   * New and included meters will have their data uploaded to the database.
   */
  compareMeterAgainstExclusionList(meterData, exclusionList) {
    // Try to find the meter in the exclusion list
    const meter = exclusionList.find(
      (meter) => meter.pp_meter_id === meterData.pp_meter_id,
    );

    if (!meter) {
      console.log(
        `Meter ${meterData.pp_meter_id} is not in the exclusion list: NEW METER`,
      );
      // Only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
      if (!this.ppMetersExcludeNotFound.includes(meterData.pp_meter_id)) {
        this.ppMetersExcludeNotFound.push(meterData.pp_meter_id);
      }
      return;
    }

    switch (meter.status) {
      case "exclude":
        console.log(`Meter ${meterData.pp_meter_id} is excluded from db`);
        // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
        if (!this.ppMetersExclude.includes(meterData.pp_meter_id)) {
          this.ppMetersExclude.push(meterData.pp_meter_id);
        }
        break;
      case "include":
        console.log(`Meter ${meterData.pp_meter_id} is included in db`);
        if (!this.ppMetersInclude.includes(meterData.pp_meter_id)) {
          // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
          this.ppMetersInclude.push(meterData.pp_meter_id);
        }
        break;
      case "new":
        console.log(
          `Meter ${meterData.pp_meter_id} status needs updating, include in db for now.`,
        );
        // only push unique meter IDs to exclusion / inclusion lists (to avoid duplicate logs)
        if (!this.ppMetersInclude.includes(meterData.pp_meter_id)) {
          this.ppMetersInclude.push(meterData.pp_meter_id);
        }
        break;
      default:
        console.log(`Meter ${meterData.pp_meter_id} unrecognized status`);
    }

    // Add meter to upload queue if it's not excluded
    if (
      !this.ppMetersExclude.includes(meterData.pp_meter_id) &&
      (this.ppMetersInclude.includes(meterData.pp_meter_id) ||
        this.ppMetersExcludeNotFound.includes(meterData.pp_meter_id))
    ) {
      console.log("Valid data found for this day found; queuing upload.");
      this.ppArray.push(meterData);
    }
  }

  async processMeterData(meterData, exclusionList) {
    if (exclusionList) {
      this.compareMeterAgainstExclusionList(meterData, exclusionList);
    } else {
      this.ppArray.push(meterData);
      console.log("Valid data found for this day found; queuing upload.");
    }
  }

  printFinalResults() {
    const arrays = [
      {
        name: "Unavailable Meters (Monthly)",
        data: this.unavailableErrorArray,
      },
      {
        name: "Delivered Error Meters (Monthly)",
        data: this.deliveredErrorArray,
      },
      { name: "Yearly Meters", data: this.yearlyArray },
      { name: "Other Errors", data: this.otherErrorArray },
      { name: "Meters Excluded", data: this.ppMetersExclude },
      { name: "Meters Included in DB", data: this.ppMetersInclude },
      {
        name: "Meters Not Found in Exclusion List (new meters)",
        data: this.ppMetersExcludeNotFound,
      },
    ];

    arrays.forEach(({ name, data }) => {
      if (data.length > 0) {
        console.log(`\n${name}: `);
        data.forEach((item) => console.log(item));
      }
    });
  }

  /**
   * Saves the various arrays to a JSON file.
   * This includes the unavailable, delivered error, yearly, and
   * other error meters, as well as the meters excluded/included/not found
   * in the database.
   */
  saveOutputToFile() {
    const outputData = [
      "Pacific Power Data to Upload: ",
      this.ppArray,
      "Unavailable Meters (Monthly): ",
      this.unavailableErrorArray,
      "Delivered Error Meters (Monthly): ",
      this.deliveredErrorArray,
      "Yearly Meters: ",
      this.yearlyArray,
      "Other Errors: ",
      this.otherErrorArray,
      "Meters Excluded from DB: ",
      this.ppMetersExclude,
      "Meters Included in DB: ",
      this.ppMetersInclude,
      "Meters Not Found in Exclusion List (new meters): ",
      this.ppMetersExcludeNotFound,
    ];

    const jsonContent = JSON.stringify(outputData, null, 2);
    fs.writeFile("./output.json", jsonContent, "utf8", function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("\nFile Saved: Yes");
    });
  }
}

// ================================
// MAIN SCRAPER CLASS
// ================================

class PacificPowerScraper {
  constructor() {
    this.page = null;
    this.browser = null;
    this.apiClient = new APIClient(CONFIG.DASHBOARD_API);
    this.meterProcessor = new MeterProcessor(this.apiClient);

    // State variables
    this.state = {
      loginSuccessFlag: false, // true = successfully logged in to Pacific Power website and retrieved meter selector number
      monthlyDataTopRowErrorFlag: false, // true = errors detected when reading meter data top row ("monthly_top"). (second highest level flag)
      prevDayFlag: false, // true = continue to check previous days' data, false = stop checking previous days' data (for current meter id)
      continueLoadingFlag: false, // true = loading screen not yet detected for the current meter (highest level flag for meter checking)
      meterErrorsFlag: false, // true = generic error detected, see otherErrorArray (highest level flag for meter checking)
      yearCheck: false, // true = "One Year" text detected in timeframe dropdown menu for current meter
      monthCheck: false, // true = "One Month" text detected in timeframe dropdown menu for current meter
      weekCheck: false, // true = "One Week" text detected in timeframe dropdown menu for current meter
      timeframeCheck: false, // generic boolean for any type of timeframe (similar logic as yearCheck, weekCheck, etc)
    };

    // Counters
    this.counters = {
      meterErrorCount: 0, // # of general errors encountered, see otherErrorArray (highest level flag)
      loadingScreenErrorCount: 0, // # of times loading screen not yet detected for the current meter (highest level flag for meter checking)
      monthlyDataTopRowError: 0, // # of errors detected when reading meter data top row ("monthly_top"). (second highest level flag)
      timeframeIterator: 0, // # of errors detected when invalid top row meter data is detected, and we need to try another timeframe
    };

    // Meter navigation
    this.meterNavigation = {
      meterSelectorNum: 0,
      firstSelectorNum: 0,
      meterSelectorFull: "",
      ppMeterId: "", // A meter's PacificPower meter ID (e.g. 78645606)
      graphButton: "",
    };

    // Data arrays
    this.timeframeChoices = [];
    this.ppRecentData = []; // list of meters from ppRecent endpoint (SQL database) for missing data detection
    this.ppMetersExclusionList = []; // list of meters from ppExclude endpoint
  }

  async initialize() {
    this.ppRecentData = await this.apiClient.getPacificPowerRecentData();
    this.ppMetersExclusionList =
      await this.apiClient.getPacificPowerMeterExclusionList();

    this.browser = await puppeteer.launch({
      // DEBUG: use --headful flag (node readPP.js --headful), browser will be visible
      headless: process.argv.includes("--headful") ? false : "new",
      args: ["--no-sandbox"],
    });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async signInToPacificPower(loginAttempts) {
    console.log("Accessing Pacific Power Web Page...");

    await this.page.goto(process.env.PP_LOGINPAGE, {
      waitUntil: "networkidle0",
      timeout: 25000,
    });

    await this.page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36",
    );
    console.log(`Current Page: ${await this.page.title()}`);

    if (loginAttempts === 0) {
      await this.page.locator(SELECTORS.ACCEPT_COOKIES).click();
      console.log("Cookies Button clicked");

      await this.page.click(SELECTORS.LOCATION_BUTTON);
      console.log("Location Button clicked");

      await this.page.click(SELECTORS.SIGN_IN_PAGE_BUTTON);
      console.log("Sign-In Page Button clicked");

      await this.page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 60000,
      });
      console.log(`Current Page: ${await this.page.title()}`);
      console.log("Waiting for Sign-In iframe form to be ready...");
      await this.page.waitForSelector("iframe", { timeout: 60000 });
      console.log("Sign-In Iframe is ready. Loading iframe content...");
      const signinIframe = await this.page.$(SELECTORS.SIGN_IN_IFRAME);
      const frame = await signinIframe.contentFrame();

      console.log("Filling username...");
      await frame
        .locator(SELECTORS.SIGN_IN_INPUT)
        .fill(process.env.PP_USERNAME);

      console.log("Filling password...");
      await frame.locator(SELECTORS.SIGN_IN_PASSWORD).fill(process.env.PP_PWD);

      await frame.click(SELECTORS.LOGIN_BUTTON);
      console.log("Login Button clicked");
      await this.page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 60000,
      });
      console.log(`Current Page: ${await this.page.title()}`);
      console.log(
        "First time logged in. Continuing to Account > Energy Usage Page...",
      );
    } else {
      console.log(
        "Already logged in. Continuing to Account > Energy Usage Page...",
      );
    }
  }

  /**
   * Navigate to the first meter's page and wait for it to finish loading.
   */
  async navigateToFirstMeterPage() {
    await this.page.goto(process.env.PP_ACCOUNTPAGE, {
      waitUntil: "networkidle0",
      timeout: 120000,
    });
    console.log(`Current Page: ${await this.page.title()}`);

    await this.page.waitForSelector("#loader-temp-secure", {
      hidden: true,
      timeout: 25000,
    });

    await this.page.waitForFunction(
      () =>
        !document.querySelector(
          "#main > wcss-full-width-content-block > div > wcss-myaccount-dashboard > div:nth-child(4) > div:nth-child(2) > wcss-payment-card > div > wcss-loading",
        ),
    );

    await this.page.waitForFunction(
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
  async getMeterSelectorNumberFromFirstMeter() {
    // it's theoretically possible to get yearly result for first meter, so check just in case
    await this.page.waitForFunction(
      () => !document.querySelector("#loading-component > mat-spinner"),
    );

    this.state.yearCheck = await this.page.$(SELECTORS.YEAR_IDENTIFIER, {
      timeout: 25000,
    });
    this.state.monthCheck = await this.page.$(SELECTORS.MONTH_IDENTIFIER, {
      timeout: 25000,
    });

    console.log("Year / Month Check found");
    if (
      (!this.state.yearCheck && !this.state.monthCheck) ||
      (this.state.yearCheck && this.state.monthCheck)
    ) {
      throw "try again";
    }

    if (this.state.yearCheck && !this.state.monthCheck) {
      this.meterNavigation.graphButton = SELECTORS.GRAPH_TO_TABLE_BUTTON_YEARLY;
    } else if (!this.state.yearCheck && this.state.monthCheck) {
      this.meterNavigation.graphButton =
        SELECTORS.GRAPH_TO_TABLE_BUTTON_MONTHLY;
    }

    await this.page.locator(this.meterNavigation.graphButton).click();
    console.log("Graph to Table Button clicked");

    await this.page.locator(SELECTORS.METER_MENU).click();
    await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_TRANSPARENT);

    console.log("Meter Menu Opened");
    this.meterNavigation.meterSelectorFull = await this.page.$eval(
      "mat-option",
      (el) => el.getAttribute("id"),
    );
    this.meterNavigation.meterSelectorNum = parseInt(
      this.meterNavigation.meterSelectorFull.slice(11),
    );
    this.meterNavigation.firstSelectorNum =
      this.meterNavigation.meterSelectorNum;
    console.log(
      "First meter selector number found (Meter #" +
        this.meterNavigation.firstSelectorNum +
        ")",
    );

    await this.page.click(SELECTORS.METER_MENU);
    console.log("Meter Menu Closed");
    await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_TRANSPARENT, {
      hidden: true,
    });
  }

  /**
   * Wait for the top row data to load and confirm that it is monthly data.
   * Throws an error if data is not monthly, which will trigger a switch to a different timeframe
   * to try to force the data to load
   */
  async waitForTopRowDataAndConfirmItsMonthly() {
    while (
      !this.state.monthlyDataTopRowErrorFlag &&
      this.counters.monthlyDataTopRowError < CONFIG.MAX_ATTEMPTS
    ) {
      try {
        await this.page.waitForSelector(SELECTORS.GRAPH_SELECTOR);
        await this.page.waitForSelector(
          SELECTORS.MONTHLY_TABLE_ROW_SELECTOR + "1)",
          {
            timeout: 25000,
          },
        );

        console.log("Monthly Top Found");

        // Early throw for odd timeframeIterator values (otherwise the meter might try to read yearly etc data
        // from monthly meters)
        if (this.counters.timeframeIterator % 2 === 1) {
          console.log(
            "throwing for odd timeframeIterator, not reading this value although it is valid",
          );
          throw "odd timeframeIterator";
        }

        //if no errors are thrown, break out of loop
        return;
      } catch (error) {
        await this.switchTimeFrameOptionToForceDataToLoad();
      }
    }
  }

  /**
   * Opens the timeframe option, checks if there is a weekly option,
   * which will indicate if the data is likely monthly or yearly.
   * Clicks on the appropriate timeframe option so that it can be switched
   * back to monthly to avoid the "no data" error when there should be data.
   */
  async switchTimeFrameOptionToForceDataToLoad() {
    console.log(`Monthly Top not found.`);

    // open up time menu and switch timeframes (month vs year etc) to avoid the "no data" (when there actually is data) glitch
    // trying to reload the page is a possibility but it's risky due to this messing with the mat-option ID's
    this.state.monthlyDataTopRowErrorFlag = true;
    await this.page.locator(SELECTORS.TIME_MENU).click();
    await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_TRANSPARENT);

    this.state.weekCheck = await this.page.$(SELECTORS.WEEK_IDENTIFIER, {
      timeout: 25000,
    });

    if (this.state.weekCheck) {
      console.log("One Week Option Found, Data is probably monthly");

      // odd timeframeIterator (0,2,4, etc) = One Month
      this.timeframeChoices = TIMEFRAME_CHOICES.MONTHLY;
    } else {
      console.log("One Week Option Not Found, Data probably yearly");

      // odd timeframeIterator (0,2,4, etc) = One Year
      this.timeframeChoices = TIMEFRAME_CHOICES.YEARLY;
    }

    this.state.timeframeCheck = await this.page.$(
      this.timeframeChoices[
        this.counters.timeframeIterator % this.timeframeChoices.length
      ].id,
      {
        timeout: 25000,
      },
    );

    if (this.state.timeframeCheck) {
      console.log(
        this.timeframeChoices[
          this.counters.timeframeIterator % this.timeframeChoices.length
        ].label + " Found",
      );
      await this.state.timeframeCheck.click();
      console.log(
        this.timeframeChoices[
          this.counters.timeframeIterator % this.timeframeChoices.length
        ].label + " Clicked",
      );
    } else {
      console.log(
        this.timeframeChoices[
          this.counters.timeframeIterator % this.timeframeChoices.length
        ].label + " Not Found",
      );

      // Monthly meters have 2 year, 1 year, 1 month, 1 week, 1 day
      // Yearly meters have 2 year, 1 year
      // So every meter's timeframe options *should* be accounted for, but just in case, we have a break statement here
      console.log("Some Other Issue");
    }
  }

  /**
   * Select a meter from the dropdown menu.
   */
  async selectMeterFromDropdownMenu() {
    await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_TRANSPARENT, {
      hidden: true,
    });
    await this.page.click(SELECTORS.METER_MENU);
    console.log("Meter Menu Opened");

    await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_TRANSPARENT);
    await this.page
      .locator(
        "#" +
          this.meterNavigation.meterSelectorFull.slice(0, 11) +
          this.meterNavigation.meterSelectorNum.toString(),
      )
      .click();
    console.log("New Meter Opened");
  }

  /**
   * Handle the loading screen that appears when switching between meters.
   */
  async handleMeterLoadingScreen() {
    while (
      !this.state.continueLoadingFlag &&
      this.counters.loadingScreenErrorCount === 0
    ) {
      try {
        await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_DARK, {
          timeout: 25000,
        });
        console.log("Loading Screen Found");
        break;
      } catch (error) {
        // console.error(error);
        console.log(`Loading Screen not found.`);
        this.state.continueLoadingFlag = true;
      }
    }

    if (this.state.continueLoadingFlag) {
      console.log("Loading Screen not found, trying again");
      this.state.continueLoadingFlag = false;
      this.counters.loadingScreenErrorCount++;

      // throwing the error will prompt a retry (in the form of continuing the while loop)
      throw new Error("Retrying due to loading screen not found");
    }

    this.state.continueLoadingFlag = false;

    // https://stackoverflow.com/questions/58833640/puppeteer-wait-for-element-disappear-or-remove-from-dom
    if (this.counters.loadingScreenErrorCount === 0) {
      await this.page.waitForSelector(SELECTORS.LOADING_BACKDROP_DARK, {
        hidden: true,
      });
    }
  }

  /**
   * Get the meter ID from the meter dropdown menu text, e.g.
   * "1234 NE ELECTRIC RD CORVALLIS OR (Item #123) (Meter #1234567)"
   * returns the meter ID 1234567.
   */
  async getMeterIdFromMeterMenu() {
    const ppMeterElement = await this.page.waitForSelector(
      SELECTORS.METER_MENU,
    );
    const ppMeterFull = await ppMeterElement.evaluate((el) => el.textContent);

    const ppMeterFullTrim = ppMeterFull.trim();
    console.log("PP Full Meter: " + ppMeterFullTrim);

    const positionMeter = "(Meter #";
    const meterStringIndex = ppMeterFullTrim.indexOf(positionMeter);
    const meterId = parseInt(
      ppMeterFullTrim.slice(meterStringIndex + 8, ppMeterFullTrim.length - 2),
    );

    return meterId;
  }

  async getRowText(monthlyTopConst, rowDays) {
    const monthlyTop = await this.page.waitForSelector(
      monthlyTopConst + rowDays + ")",
    );
    const monthlyTopText = await monthlyTop.evaluate((el) => el.textContent);
    return monthlyTopText;
  }

  async getRowData(monthlyTopText, positionUsage, positionEst) {
    const usageKwh = parseFloat(
      monthlyTopText.split(positionUsage)[1].split(positionEst)[0],
    );

    // get the date for the data
    const positionPeriod = "Period";
    const positionAve = "Average";
    const date = monthlyTopText.split(positionPeriod)[1].split(positionAve)[0];
    const { END_TIME, END_TIME_SECONDS } = DateUtils.formatDateAndTime(date);

    return { usage_kwh: usageKwh, date, END_TIME, END_TIME_SECONDS };
  }

  /**
   * This function handles the highest level error for a meter
   */
  handleUnknownMeterError(error) {
    console.error(error);
    this.meterProcessor.otherErrorArray.push({
      meter_selector_num: this.meterNavigation.meterSelectorNum,
      pp_meter_id: this.meterNavigation.ppMeterId,
    });
    console.log(
      this.meterNavigation.meterSelectorNum.toString() +
        " Unknown Issue, Skipping to next meter",
    );

    // In general, timeframeIterator should be reset on every exit path for the current meter ID
    // (unlike some other flags that keep track of number of errors, that we may want to persist between different meters)
    this.counters.timeframeIterator = 0;
    this.meterNavigation.meterSelectorNum++;
    this.counters.meterErrorCount++;
    if (this.counters.meterErrorCount === CONFIG.MAX_ATTEMPTS) {
      console.log(
        `Re-Checked ${CONFIG.MAX_ATTEMPTS} times, Stopping Webscraper`,
      );
    }
  }

  /**
   * Main function to get meter data from the Pacific Power website. Loops through all
   * meters in the meter dropdown menu that have data available.
   */
  async getMeterData() {
    // DEBUG: testing at specific meter ID, e.g. to see if termination behavior works
    // this.meterNavigation.meterSelectorNum = 110;

    while (
      !this.state.meterErrorsFlag &&
      this.counters.meterErrorCount < CONFIG.MAX_ATTEMPTS
    ) {
      try {
        console.log("\n");
        console.log(
          "Fetching data for Meter Selector #" +
            this.meterNavigation.meterSelectorNum.toString(),
        );

        // After the first time a loading screen is detected, don't need to open meter menu again (for current meter ID)
        if (this.counters.loadingScreenErrorCount === 0) {
          await this.selectMeterFromDropdownMenu();
        }

        // if we're past the first meter, we need to wait for the loading screen to disappear
        if (
          this.meterNavigation.firstSelectorNum !==
          this.meterNavigation.meterSelectorNum
        ) {
          try {
            await this.handleMeterLoadingScreen();
          } catch (err) {
            // an error occurred with the loading screen, try again
            continue;
          }
        }

        // Get Pacific Power Meter ID
        this.meterNavigation.ppMeterId = await this.getMeterIdFromMeterMenu();
        console.log(
          "PP Meter ID: " + this.meterNavigation.ppMeterId.toString(),
        );

        // Check if top row monthly data is available
        await this.waitForTopRowDataAndConfirmItsMonthly();

        // This increases in value every time we try to read a given meter's data (assuming scraper got past loading screen check)
        this.counters.timeframeIterator++;
        if (this.state.monthlyDataTopRowErrorFlag) {
          console.log("Monthly Top not found, try again");
          console.log(
            "Attempt " +
              (this.counters.monthlyDataTopRowError + 1).toString() +
              " of " +
              CONFIG.MAX_ATTEMPTS,
          );
          this.counters.monthlyDataTopRowError++;
          if (this.counters.monthlyDataTopRowError === CONFIG.MAX_ATTEMPTS) {
            console.log(
              `Re-Checked ${CONFIG.MAX_ATTEMPTS} times, Stopping Webscraper`,
            );
            this.state.meterErrorsFlag = true;
            break;
          }
          this.state.monthlyDataTopRowErrorFlag = false;
          continue;
        }

        // Always reset row_days (for each meter ID) to 1 (or whatever is default value) before checking past week's data
        let rowDays = CONFIG.STARTING_TABLE_ROW;
        let monthlyTopText = await this.getRowText(
          SELECTORS.MONTHLY_TABLE_ROW_SELECTOR,
          rowDays,
        );

        console.log("Monthly Data Top Row Found, getting table top row value");
        const positionUsage = "Usage(kwh)";
        const positionEst = "Est. Rounded";

        if (monthlyTopText.includes(positionEst)) {
          console.log("Data is not yearly. Data is probably monthly.");
          console.log("========================");
          console.log(monthlyTopText);
        } else {
          console.log("Year Check Found, skipping to next meter");
          console.log("========================");
          console.log(monthlyTopText);

          // "'Yearly Meter type' Valid Data detected scenario" exit path here, reset flags
          this.meterProcessor.yearlyArray.push({
            meter_selector_num: this.meterNavigation.meterSelectorNum,
            pp_meter_id: this.meterNavigation.ppMeterId,
          });
          this.meterNavigation.meterSelectorNum++;
          this.counters.loadingScreenErrorCount = 0;
          this.counters.timeframeIterator = 0;
          continue;
        }

        // The point of monthlyDataTopRowError is to keep track of number of retries
        // needed before valid data is detected, so this variable is reset as long as valid data was detected, regardless
        // of if the meter was monthly or yearly type
        this.state.monthlyDataTopRowErrorFlag = false;
        this.counters.monthlyDataTopRowError = 0;

        // Always reset actual_days (for each meter ID) to 1 (or whatever is default value) before checking past week's data
        let actualDays = CONFIG.STARTING_DAYS_BACK;

        while (
          !this.state.prevDayFlag &&
          actualDays <= CONFIG.MAX_PREV_DAY_COUNT
        ) {
          try {
            try {
              monthlyTopText = await this.getRowText(
                SELECTORS.MONTHLY_TABLE_ROW_SELECTOR,
                rowDays,
              );
            } catch (error) {
              console.log(
                `Meter data for ${actualDays} days ago not found on pacific power site, likely due to this being a new meter. Exiting early.`,
              );
              console.error(error);
              this.state.prevDayFlag = true;
            }

            if (actualDays > CONFIG.STARTING_DAYS_BACK) {
              console.log(
                "Monthly Data Top Row Found, getting table top row value",
              );
              console.log("========================");
              console.log(monthlyTopText);
            }

            if (monthlyTopText.includes("Unavailable")) {
              console.log(
                "'Unavailable' error detected for monthly time range, skipping to next day",
              );
              rowDays += 1;
              actualDays += 1;
              this.meterProcessor.unavailableErrorArray.push({
                meter_selector_num: this.meterNavigation.meterSelectorNum,
                pp_meter_id: this.meterNavigation.ppMeterId,
              });
              continue;
            }

            if (
              monthlyTopText.includes("delivered to you") ||
              monthlyTopText.includes("received from you")
            ) {
              console.log(
                "'delivered / received' error detected for monthly time range, skipping to next day",
              );
              rowDays += 1;
              actualDays += 1;
              this.meterProcessor.deliveredErrorArray.push({
                meter_selector_num: this.meterNavigation.meterSelectorNum,
                pp_meter_id: this.meterNavigation.ppMeterId,
              });
              continue;
            }

            const { usage_kwh, date, END_TIME, END_TIME_SECONDS } =
              await this.getRowData(monthlyTopText, positionUsage, positionEst);
            const actualDate = DateUtils.getActualDate(actualDays).actualDate;

            const ppTable = {
              meter_selector_num: this.meterNavigation.meterSelectorNum,
              pp_meter_id: this.meterNavigation.ppMeterId,
              usage_kwh,
              time: END_TIME,
              time_seconds: END_TIME_SECONDS,
            };

            if (
              DateUtils.isMatchingDate(date, actualDate) &&
              !ValidationUtils.isMeterInDatabase(
                this.meterNavigation.ppMeterId,
                END_TIME_SECONDS,
                this.ppRecentData,
              ) &&
              !ValidationUtils.isMeterInUploadQueue(
                this.meterNavigation.ppMeterId,
                END_TIME_SECONDS,
                this.meterProcessor.ppArray,
              )
            ) {
              // if exclusion list was fetched, compare the meter against it to exclude meters
              // otherwise we will add all meter data to db
              this.meterProcessor.processMeterData(
                ppTable,
                this.ppMetersExclusionList,
              );
            }

            if (actualDays === CONFIG.MAX_PREV_DAY_COUNT) {
              console.log(
                `Reached max day count of ${CONFIG.MAX_PREV_DAY_COUNT} days, exiting`,
              );
              this.state.prevDayFlag = true;
              break;
            }

            if (date && date !== actualDate) {
              console.log(
                "Now going back 1 more day (actual date), let's see if that syncs us up with date from Pacific Power site",
              );
              actualDays += 1;
              const ACTUAL_DATE_UNIX =
                DateUtils.getActualDate(actualDays).actualDateUnix;
              if (ACTUAL_DATE_UNIX === END_TIME_SECONDS) {
                console.log(
                  "Synced actual date and date from Pacific Power site, go to equalled if loop",
                );
                continue;
              }
            } else if (date && date === actualDate) {
              rowDays += 1;
              actualDays += 1;
            }
          } catch (error) {
            console.log("Some other error occurred, skipping to next meter");
            console.error(error);
            this.meterProcessor.otherErrorArray.push({
              meter_selector_num: this.meterNavigation.meterSelectorNum,
              pp_meter_id: this.meterNavigation.ppMeterId,
            });
            this.state.prevDayFlag = true;
          }
        }
        this.state.prevDayFlag = false;

        // If "Est. Rounded" is found, then the data is monthly.
        // "Best Case Scenario" (valid data from 'Monthly' meter type) exit path here, reset flags
        if (monthlyTopText.includes(positionEst)) {
          this.meterNavigation.meterSelectorNum++;
          this.counters.loadingScreenErrorCount = 0;
          this.counters.timeframeIterator = 0;
        }
      } catch (error) {
        this.handleUnknownMeterError(error);
      }
    }
  }

  async run() {
    const startDate = moment().unix();

    try {
      await this.initialize();

      // Login and get meter selector number (needed for navigating between meters)
      for (let i = 0; i < CONFIG.MAX_ATTEMPTS; i++) {
        try {
          // Create page
          this.page = await this.browser.newPage();
          this.page.setDefaultTimeout(CONFIG.TIMEOUT_BUFFER);
          await this.page.setCacheEnabled(false);
          await this.page.reload({ waitUntil: "networkidle2" });

          // Sign in and get meter selector number for meter navigation
          await this.signInToPacificPower(i);
          await this.navigateToFirstMeterPage();
          await this.getMeterSelectorNumberFromFirstMeter();

          console.log("\n========== ENTERING RECURRING LOG SECTION ==========");
          this.state.loginSuccessFlag = true;
          break;
        } catch (err) {
          console.error(err);
          console.log(
            `Unknown Issue en route to Energy Usage Page, (Attempt ${
              i + 1
            } of ${CONFIG.MAX_ATTEMPTS}). Retrying...`,
          );
          if (i + 1 === CONFIG.MAX_ATTEMPTS) {
            console.log(
              `Login failed after ${CONFIG.MAX_ATTEMPTS} attempts, Stopping Webscraper!`,
            );
            break;
          }
        }
      }

      if (this.state.loginSuccessFlag) {
        await this.getMeterData();
      }

      // Add new meters found to database
      if (!process.argv.includes("--no-upload")) {
        await this.apiClient.addNewMetersToDatabase(
          this.meterProcessor.ppMetersExcludeNotFound,
        );
      }

      // Log all data to be uploaded
      if (this.meterProcessor.ppArray.length > 0) {
        console.log("\nData to be uploaded: ");
      } else {
        console.log(
          "\nNo data to be uploaded, SQL database is already up to date",
        );
      }

      // Process data for each meter
      for (const meterData of this.meterProcessor.ppArray) {
        console.log(meterData);

        if (!process.argv.includes("--no-upload")) {
          await this.apiClient.uploadDataToDatabase(meterData);
        }
      }

      console.log(
        "\nStart Timestamp (approximate): " +
          moment
            .unix(startDate)
            .tz("America/Los_Angeles")
            .format("MM-DD-YYYY hh:mm a") +
          " PST",
      );
      console.log(
        "End Timestamp (approximate): " +
          moment
            .unix(Date.now() / 1000)
            .tz("America/Los_Angeles")
            .format("MM-DD-YYYY hh:mm a") +
          " PST",
      );
      // Print final results of arrays (meters with errors, meters excluded, etc)
      this.meterProcessor.printFinalResults();
      if (
        process.argv.includes("--save-output") ||
        process.env.SAVE_OUTPUT === "true"
      ) {
        this.meterProcessor.saveOutputToFile();
      }
    } finally {
      await this.cleanup();
    }
  }
}

// ================================
// MAIN EXECUTION
// ================================

(async () => {
  const scraper = new PacificPowerScraper();
  await scraper.run();
})();
