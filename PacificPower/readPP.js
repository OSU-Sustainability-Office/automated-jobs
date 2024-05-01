// https://pptr.dev/guides/evaluate-javascript

// total runtime with current parameters: As fast as 4 minutes not counting last noData checks, or 9 minutes with noData checks

// The various timeouts and while loops + try/catch blocks on this page are probably overkill, but the errors seem to show up at
// random (based on Internet speed etc), so better safe than sorry for production. You can lower the timeouts for debug.

const puppeteer = require("puppeteer");
const moment = require("moment-timezone");
require("dotenv").config();
const startDate = moment().unix();
const apiRecentUrl = process.env.DASHBOARD_API + "/pprecent";
const actual_days_const = 1;
const row_days_const = 1;
const maxPrevDayCount = 7;

const TIMEOUT_BUFFER = 1200000; // Currently set for 20 minutes (1,200,000 ms), based on results as noted above
const axios = require("axios");
const fs = require("fs");
const maxAttempts = 5;
let meter_selector_full = "";
let meter_selector_num = "";
const ACCEPT_COOKIES = "button.cookie-accept-button";
const LOCATION_BUTTON = "a.modalCloseButton"; // button for closing a popup about what state you're in

// This is the button that takes you to the sign in page, not the button you press to actually log in
const SIGN_IN_PAGE_BUTTON = "a.link.link--default.link--size-default.signin";

const SIGN_IN_IFRAME = 'iframe[src="/oauth2/authorization/B2C_1A_PAC_SIGNIN"]';
const SIGN_IN_INPUT = "input#signInName"; // aka username
const SIGN_IN_PASSWORD = "input#password";

// This is the actual login button, as opposed to signin page button
const LOGIN_BUTTON = "button#next";

const GRAPH_TO_TABLE_BUTTON_MONTHLY =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(3) > img";
const GRAPH_TO_TABLE_BUTTON_YEARLY =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div > a:nth-child(3) > img";
const METER_MENU = "#mat-select-0 > div > div.mat-select-value > span";
const TIME_MENU = "#mat-select-1 > div > div.mat-select-value > span";
const YEAR_IDENTIFIER = "//span[contains(., 'One Year')]";
const MONTH_IDENTIFIER = "//span[contains(., 'One Month')]";
const WEEK_IDENTIFIER = "//span[contains(., 'One Week')]";
const TWO_YEAR_IDENTIFIER = "//span[contains(., 'Two Year')]";
const MONTHLY_TOP =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(";
let monthly_top_text = "";
let yearCheck = false;
let prevDayFlag = false;
let monthCheck = false;
let weekCheck = false;
let twoYearCheck = false;
let continueMetersFlag = false;
let continueLoadingFlag = false;
let continueVarMonthlyFlag = false;
let graphButton = "";
let first_selector_num = 0;
let PPArray = [];
let unAvailableErrorArray = [];
let deliveredErrorArray = [];
let otherErrorArray = [];
let wrongDateArray = [];
let wrongDateGapArray = [];
let yearlyArray = [];
let continueDetailsFlag = false;
let successDetailsFlag = false;
let monthly_top = "";
let continueDetails = 0;
let continueMeters = 0;
let continueVarLoading = 0;
let continueVarMonthly = 0;
let page = "";
let pp_meter_id = "";
let PPTable = {};

let pp_recent_list = null;
let pp_recent_matching = null;
let pp_recent_matching_time = null;
let matching_pp_array = null;

async function getRowText(monthly_top_const, row_days) {
  monthly_top = await page.waitForSelector(monthly_top_const + row_days + ")");
  monthly_top_text = await monthly_top.evaluate((el) => el.textContent);
  return monthly_top_text;
}

function getActualDate(actual_days) {
  // reference (get time in any timezone and string format): https://momentjs.com/timezone/docs/
  // yesterday's date in PST timezone, YYYY-MM-DD format
  let actualDate = moment
    .tz(
      new Date(new Date().getTime() - actual_days * 24 * 60 * 60 * 1000),
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

(async () => {
  pp_recent_list = await axios
    .get(apiRecentUrl)
    .then((res) => {
      if (res.status < 200 || res.status >= 300) {
        throw new Error("Failed to fetch PP Recent Data List");
      }

      console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}`);
      return res.data;
    })
    .catch((err) => {
      console.log(err);
    });

  if (pp_recent_list) {
    console.log("PP Recent Data List:");
    for (let i = 0; i < pp_recent_list.length; i++) {
      console.log(pp_recent_list[i]);
    }
  } else {
    console.log(
      "Could not get PP Recent Data List. Redundant data (same meter ID and timestamp as an existing value) might be uploaded to SQL database.",
    );
  }

  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new", // set to false (no quotes) for debug. Leave as "new" (with quotes) for production | reference: https://developer.chrome.com/articles/new-headless/
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });
  while (!continueDetailsFlag && continueDetails < maxAttempts) {
    try {
      console.log("Accessing Pacific Power Web Page...");

      // Create a page
      page = await browser.newPage();
      await page.setDefaultTimeout(TIMEOUT_BUFFER);
      await page.setCacheEnabled(false);
      await page.reload({ waitUntil: "networkidle2" });

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

      await page.waitForTimeout(25000);
      if (continueDetails === 0) {
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
        await page.waitForTimeout(25000);
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

        // uncomment for login error handling
        // throw "testing login error handling try again";
      } else if (continueDetails > 0) {
        console.log(
          "Already logged in, continuing to Account > Energy Usage Page",
        );
      }

      // Note changed accountpage URL from env file (now goes direct to energy usage page).
      // The page.goto() as well as `await page.setCacheEnabled(false)` seems to improve reliability of getting
      // to the energy usage page, but note some of the selector indices change from 1 to 0, "meter_selector_num"
      // now starts from 0 instead of 500+, and that after logging in once, you will stay logged in on other pages.
      // See `continueDetails` variable, and also run the scraper with `headless: false` to see the process.
      await page.goto(process.env.PP_ACCOUNTPAGE, {
        waitUntil: "networkidle0",
        timeout: 120000,
      });
      console.log(await page.title());
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

      // it's theoretically possible to get yearly result for first meter, so check just in case
      // await page.waitForTimeout(25000);
      await page.waitForFunction(
        () => !document.querySelector("#loading-component > mat-spinner"),
      );
      [yearCheck] = await page.$x(YEAR_IDENTIFIER, { timeout: 25000 });
      [monthCheck] = await page.$x(MONTH_IDENTIFIER, { timeout: 25000 });
      console.log("Year / Month Check found");
      if ((!yearCheck && !monthCheck) || (yearCheck && monthCheck)) {
        throw "try again";
      }

      if (yearCheck && !monthCheck) {
        graphButton = GRAPH_TO_TABLE_BUTTON_YEARLY;
      } else if (!yearCheck && monthCheck) {
        graphButton = GRAPH_TO_TABLE_BUTTON_MONTHLY;
      }

      await page.waitForTimeout(25000);
      await page.waitForSelector(graphButton, { timeout: 25000 });
      console.log("Graph to Table Button clicked");

      await page.click(graphButton);

      await page.waitForTimeout(25000);
      await page.waitForSelector(METER_MENU);

      await page.click(METER_MENU);

      await page.waitForFunction(() =>
        document.querySelector(
          "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing",
        ),
      );
      console.log("Meter Menu Opened");
      meter_selector_full = await page.$eval("mat-option", (el) =>
        el.getAttribute("id"),
      );
      meter_selector_num = parseInt(meter_selector_full.slice(11));
      first_selector_num = meter_selector_num;
      // console.log(meter_selector_full);
      console.log("Meter ID Found");

      await page.click(METER_MENU);
      console.log("Meter Menu Closed");
      await page.waitForFunction(
        () =>
          !document.querySelector(
            "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing",
          ),
      );
      // one time pause after closing menu before the while loops, just in case
      // await page.waitForTimeout(10000);

      console.log("\nLogs are recurring after this line");
      continueDetailsFlag = true;
      continueDetails = 0;
      successDetailsFlag = true;
    } catch (err) {
      console.error(err);
      console.log(
        `Unknown Issue en route to Energy Usage Page, (Attempt ${
          continueDetails + 1
        } of ${maxAttempts}). Retrying...`,
      );
      continueDetails++;
      if (continueDetails === maxAttempts) {
        console.log(`Re-Checked ${maxAttempts} times, Stopping Webscraper`);
        continueDetailsFlag = true;
        break;
      }
      continueDetailsFlag = false;
    }
  }
  if (successDetailsFlag) {
    if (process.argv.includes("--testing")) {
      console.log(meter_selector_num);
    } else {
      // testing at specific meter ID, e.g. to see if termination behavior works
      // meter_selector_num = 621;

      while (!continueMetersFlag && continueMeters < maxAttempts) {
        try {
          console.log("\n" + meter_selector_num.toString());
          await page.waitForFunction(
            () =>
              !document.querySelector(
                "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing",
              ),
          );
          await page.click(METER_MENU);
          console.log("Meter Menu Opened");

          // await page.waitForTimeout(10000);
          await page.waitForFunction(() =>
            document.querySelector(
              "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing",
            ),
          );
          await page.waitForSelector(
            "#" +
              meter_selector_full.slice(0, 11) +
              meter_selector_num.toString(),
          );
          console.log("New Meter Opened");

          await page.click(
            "#" +
              meter_selector_full.slice(0, 11) +
              meter_selector_num.toString(),
          );

          if (first_selector_num !== meter_selector_num) {
            // console.log(first_selector_num);
            // await page.waitForTimeout(500);
            while (!continueLoadingFlag && continueVarLoading === 0) {
              try {
                await page.waitForFunction(
                  () =>
                    document.querySelector(
                      "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing",
                    ),
                  { timeout: 25000 },
                );
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
              continueVarLoading++;
              continue;
            }

            continueLoadingFlag = false;

            // https://stackoverflow.com/questions/58833640/puppeteer-wait-for-element-disappear-or-remove-from-dom
            if (continueVarLoading === 0) {
              await page.waitForFunction(
                () =>
                  !document.querySelector(
                    "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing",
                  ),
              );
            }
          }

          const pp_meter_element = await page.waitForSelector(METER_MENU);
          const pp_meter_full = await pp_meter_element.evaluate(
            (el) => el.textContent,
          );

          let pp_meter_full_trim = pp_meter_full.trim();
          console.log(pp_meter_full_trim);

          let positionMeter = "(Meter #";
          let meterStringIndex = pp_meter_full_trim.indexOf(positionMeter);
          pp_meter_id = parseInt(
            pp_meter_full_trim.slice(
              meterStringIndex + 8,
              pp_meter_full_trim.length - 2,
            ),
          );
          console.log("PP Meter ID: " + pp_meter_id.toString());

          // await page.waitForSelector(
          // "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area",
          // );
          while (!continueVarMonthlyFlag && continueVarMonthly < maxAttempts) {
            try {
              await page.waitForSelector(
                "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area",
              );
              await page.waitForSelector(MONTHLY_TOP + "1)", {
                timeout: 25000,
              });
              console.log("Monthly Top Found");
              break;
            } catch (error) {
              // console.error(error);
              console.log(`Monthly Top not found.`);

              // return to the previous meter and start again, seems only way to avoid the "no data" (when there actually is data) glitch
              // trying to reload the page is a possibility but it's risky due to this messing with the mat-option ID's
              // meter_selector_num -= 1;
              prev_meter_flag = true;
              continueVarMonthlyFlag = true;
              await page.waitForSelector(TIME_MENU);

              await page.click(TIME_MENU);
              // await page.waitForTimeout(10000);
              await page.waitForFunction(() =>
                document.querySelector(
                  "body > div.cdk-overlay-container > div.cdk-overlay-backdrop.cdk-overlay-transparent-backdrop.cdk-overlay-backdrop-showing",
                ),
              );
              if (continueVarMonthly % 2 === 0) {
                [weekCheck] = await page.$x(WEEK_IDENTIFIER, {
                  timeout: 25000,
                });
                if (weekCheck) {
                  console.log("Week Option Found");
                  await weekCheck.click();
                  console.log("Week Option Clicked");
                } else {
                  console.log("Week Option Not Found");
                  [twoYearCheck] = await page.$x(TWO_YEAR_IDENTIFIER, {
                    timeout: 25000,
                  });
                  if (twoYearCheck) {
                    console.log("Two Year Option Found");
                    await twoYearCheck.click();
                    console.log("Two Year Option Clicked");
                  } else {
                    console.log("Some other issue");
                    break;
                  }
                }
              } else {
                [monthCheck] = await page.$x(MONTH_IDENTIFIER, {
                  timeout: 25000,
                });
                if (monthCheck) {
                  console.log("Month Option Found");
                  await monthCheck.click();
                  console.log("Month Option Clicked");
                } else {
                  console.log("Month Option Not Found");
                  [yearCheck] = await page.$x(YEAR_IDENTIFIER, {
                    timeout: 25000,
                  });
                  if (yearCheck) {
                    console.log("Year Option Found");
                    await yearCheck.click();
                    console.log("Year Option Clicked");
                  } else {
                    console.log("Some other issue");
                    break;
                  }
                }
              }
            }
          }

          if (continueVarMonthlyFlag) {
            console.log("Monthly Top not found, try again");
            console.log(
              "Attempt " +
                (continueVarMonthly + 1).toString() +
                " of " +
                maxAttempts,
            );
            continueVarMonthlyFlag = false;
            continueVarMonthly++;
            if (continueVarMonthly === maxAttempts) {
              console.log(
                `Re-Checked ${maxAttempts} times, Stopping Webscraper`,
              );
              continueMetersFlag = true;
              break;
            }
            continue;
          }

          let row_days = row_days_const;
          monthly_top_text = await getRowText(MONTHLY_TOP, row_days);
          console.log(
            "Monthly Data Top Row Found, getting table top row value",
          ); // TODO: Fix this to be just "top row" or something, rename "monthly" var names to be more clear on time interval vs total time frame
          let positionUsage = "Usage(kwh)"; // You can edit this value to something like "Usage(kwhdfdfd)" to test the catch block at the end
          let positionEst = "Est. Rounded";

          // Custom breakpoint for testing
          /*
          if (meter_selector_num === 4) {
            continueMetersFlag = true;
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
            yearlyArray.push({ meter_selector_num, pp_meter_id });
            meter_selector_num++;
            continueVarLoading = 0;
            continue;
          }

          continueVarMonthlyFlag = false;
          continueVarMonthly = 0;

          let actual_days = actual_days_const;

          while (!prevDayFlag && actual_days <= maxPrevDayCount) {
            try {
              try {
                monthly_top_text = await getRowText(MONTHLY_TOP, row_days);
              } catch (error) {
                console.log(
                  `Meter data for ${actual_days} days ago not found, likely due to this being a new meter. Exiting early.`,
                );
                prevDayFlag = true;
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
                  "Unavailable Usage (kwh) data for monthly time range, skipping to next day",
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
                  "Unavailable Usage (kwh) data for monthly time range, skipping to next day",
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
              let { actualDate, ACTUAL_DATE_UNIX } = getActualDate(actual_days);
              if (pp_recent_list) {
                pp_recent_matching = pp_recent_list.find(
                  (o) => o.pacific_power_meter_id === pp_meter_id,
                );
                pp_recent_matching_time = moment
                  .tz(
                    pp_recent_matching.time_seconds * 1000, // moment.tz expects milliseconds
                    "America/Los_Angeles",
                  )
                  .format("YYYY-MM-DD");
              }
              if (date && date !== actualDate) {
                if (pp_recent_list) {
                  if (pp_recent_matching) {
                    console.log(
                      "Actual date matches date from Pacific Power site, now let's check SQL database for matching dates as well",
                    );
                  } else {
                    console.log(
                      "No matching data for this day found yet in SQL database",
                    );
                  }
                }
                console.log("Actual date: " + actualDate);
                console.log(
                  "Date shown on Pacific Power site: " + date.toString(),
                );
                if (pp_recent_list) {
                  if (pp_recent_matching) {
                    console.log(
                      "Latest date in SQL database: " + pp_recent_matching_time,
                    );
                  } else {
                    console.log(
                      "No matching data for this day found yet in SQL database",
                    );
                  }
                  if (
                    pp_recent_matching_time &&
                    pp_recent_matching_time === actualDate
                  ) {
                    console.log(
                      "Data for this day already exists in SQL database, skipping upload",
                    );
                    prevDayFlag = true;
                    break;
                  }
                }
                PPTable = {
                  meter_selector_num,
                  pp_meter_id,
                  usage_kwh,
                  time: END_TIME,
                  time_seconds: END_TIME_SECONDS,
                };

                // PPArray contains the data to be uploaded today, check for duplicate values before uploading
                matching_pp_array = PPArray.find(
                  (o) =>
                    o.pp_meter_id === PPTable.pp_meter_id &&
                    o.time_seconds === PPTable.time_seconds,
                );

                if (
                  ((pp_recent_matching &&
                    String(pp_recent_matching.time_seconds) !==
                      END_TIME_SECONDS) ||
                    !pp_recent_matching) &&
                  !matching_pp_array
                ) {
                  PPArray.push(PPTable);
                  console.log(
                    "Valid data to be uploaded found (actual date and date on pacific power site out of sync)",
                  );
                  wrongDateArray.push({
                    meter_selector_num,
                    pp_meter_id,
                    time: END_TIME,
                    time_seconds: END_TIME_SECONDS,
                  });
                }
                if (actual_days === maxPrevDayCount) {
                  console.log(
                    `Reached max day count of ${maxPrevDayCount} days, exiting`,
                  );
                  prevDayFlag = true;
                  break;
                }
                console.log(
                  "Now going back 1 more day (actual date), let's see if that syncs us up with date from Pacific Power site",
                );
                if (ACTUAL_DATE_UNIX === END_TIME_SECONDS) {
                  console.log(
                    "Synced actual date and date from Pacific Power site, go to equalled if loop",
                  );
                  continue;
                }
                actual_days += 1;
              } else if (date && date === actualDate) {
                if (pp_recent_list) {
                  if (pp_recent_matching) {
                    console.log(
                      "Actual date matches date from Pacific Power site, now let's check SQL database for matching dates as well",
                    );
                  } else {
                    console.log(
                      "No matching data for this day found yet in SQL database",
                    );
                  }
                }
                console.log("Actual date: " + actualDate);
                console.log(
                  "Date shown on Pacific Power site: " + date.toString(),
                );
                if (pp_recent_list) {
                  if (pp_recent_matching) {
                    console.log(
                      "Latest date in SQL database: " + pp_recent_matching_time,
                    );
                  } else {
                    console.log(
                      "No matching data for this day found yet in SQL database",
                    );
                  }
                  if (
                    pp_recent_matching_time &&
                    pp_recent_matching_time === actualDate
                  ) {
                    console.log(
                      "Data for this day already exists in SQL database, skipping upload",
                    );
                    prevDayFlag = true;
                    break;
                  }
                }
                PPTable = {
                  meter_selector_num,
                  pp_meter_id,
                  usage_kwh,
                  time: END_TIME,
                  time_seconds: END_TIME_SECONDS,
                };

                // PPArray contains the data to be uploaded today, check for duplicate values before uploading
                matching_pp_array = PPArray.find(
                  (o) =>
                    o.pp_meter_id === PPTable.pp_meter_id &&
                    o.time_seconds === PPTable.time_seconds,
                );
                if (
                  ((pp_recent_matching &&
                    String(pp_recent_matching.time_seconds) !==
                      END_TIME_SECONDS) ||
                    !pp_recent_matching) &&
                  !matching_pp_array
                ) {
                  PPArray.push(PPTable);
                  console.log(
                    "Valid data to be uploaded found (synced actual date and date on pacific power site)",
                  );
                  if (actual_days > actual_days_const) {
                    wrongDateGapArray.push({
                      meter_selector_num,
                      pp_meter_id,
                      time: END_TIME,
                      time_seconds: END_TIME_SECONDS,
                    });
                  }
                }
                if (actual_days === maxPrevDayCount) {
                  console.log(
                    `Reached max day count of ${maxPrevDayCount} days, exiting`,
                  );
                  prevDayFlag = true;
                  break;
                }
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
          if (monthly_top_text.includes(positionEst)) {
            meter_selector_num++;
            continueVarLoading = 0;
          }
        } catch (error) {
          // This catch ensures that if one meter errors out, we can keep going to next meter instead of whole webscraper crashing
          console.error(error);
          otherErrorArray.push({ meter_selector_num, pp_meter_id });
          console.log(
            meter_selector_num.toString() +
              " Unknown Issue, Skipping to next meter",
          );
          meter_selector_num++;
          continueMeters++;
          if (continueMeters === maxAttempts) {
            console.log(`Re-Checked ${maxAttempts} times, Stopping Webscraper`);
          }
        }
      }
    }
  }

  const pacificPowerMeters = "pacific_power_data";

  if (process.argv.includes("--no-upload") && PPArray.length > 0) {
    console.log("\nData to be uploaded: ");
  } else if (process.argv.includes("--no-upload") && PPArray.length === 0) {
    console.log("\nNo data to be uploaded, SQL database is already up to date");
  }
  for (let i = 0; i < PPArray.length; i++) {
    // No need to log the data twice if uploading
    if (process.argv.includes("--no-upload")) {
      console.log(PPArray[i]);
    }

    // to prevent uploading data to API: node readPP.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await axios({
        method: "post",
        url: `${process.env.DASHBOARD_API}/upload`,
        data: {
          id: pacificPowerMeters,
          body: PPArray[i],
          pwd: process.env.API_PWD,
          type: "pacific_power",
        },
      })
        .then((res) => {
          console.log(
            `RESPONSE: ${res.status}, TEXT: ${
              res.statusText
            }, DATA: ${JSON.stringify(res.data)}`,
          );
        })
        .catch((err) => {
          console.log(err);
        });
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
  if (wrongDateArray.length > 0) {
    console.log("\nWrong Date Meters (Monthly, new upload): ");
  }
  for (let i = 0; i < wrongDateArray.length; i++) {
    console.log(wrongDateArray[i]);
  }
  if (wrongDateGapArray.length > 0) {
    console.log("\nWrong Date Gap Meters (Monthly, new upload): ");
  }
  for (let i = 0; i < wrongDateGapArray.length; i++) {
    console.log(wrongDateGapArray[i]);
  }
  if (unAvailableErrorArray.length > 0) {
    console.log("\nUnavailable Meters (Monthly): ");
  }
  for (let i = 0; i < unAvailableErrorArray.length; i++) {
    console.log(unAvailableErrorArray[i]);
  }
  if (deliveredErrorArray.length > 0) {
    console.log("\nDelivered Error Meters (Monthly): ");
  }
  for (let i = 0; i < deliveredErrorArray.length; i++) {
    console.log(deliveredErrorArray[i]);
  }
  if (yearlyArray.length > 0) {
    console.log("\nYearly Meters: ");
  }
  for (let i = 0; i < yearlyArray.length; i++) {
    console.log(yearlyArray[i]);
  }
  if (otherErrorArray.length > 0) {
    console.log("\nOther Errors: ");
  }
  for (let i = 0; i < otherErrorArray.length; i++) {
    console.log(otherErrorArray[i]);
  }

  // node readPP.js --save-output
  if (
    process.argv.includes("--save-output") ||
    process.env.SAVE_OUTPUT === "true"
  ) {
    PPArray.push("Wrong Date Meters (Monthly): ");
    PPArray.push(wrongDateArray);
    PPArray.push("Wrong Date Gap Meters (Monthly): ");
    PPArray.push(wrongDateGapArray);
    PPArray.push("Unavailable Meters (Monthly): ");
    PPArray.push(unAvailableErrorArray);
    PPArray.push("Yearly Meters: ");
    PPArray.push(yearlyArray);
    PPArray.push("Other Errors: ");
    PPArray.push(otherErrorArray);
    const jsonContent = JSON.stringify(PPArray, null, 2);
    fs.writeFile("./output.json", jsonContent, "utf8", function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("\nFile Saved: Yes");
    });
  }

  // Close browser.
  await browser.close();
})();
