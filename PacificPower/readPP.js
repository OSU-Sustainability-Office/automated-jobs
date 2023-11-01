// https://pptr.dev/guides/evaluate-javascript

// total runtime with current parameters: As fast as 4 minutes not counting last noData checks, or 9 minutes with noData checks

// The various timeouts and while loops + try/catch blocks on this page are probably overkill, but the errors seem to show up at
// random (based on Internet speed etc), so better safe than sorry for production. You can lower the timeouts for debug.

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 7200000; // Currently set for 2 hours (7,200,000 ms), based on 42 minutes actual result as noted above
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

// This button takes you to a specific meter's page
const USAGE_DETAILS = "a.usage-link";

const GRAPH_TO_TABLE_BUTTON_MONTHLY =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(3) > img";
const GRAPH_TO_TABLE_BUTTON_YEARLY =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div > a:nth-child(3) > img";
const METER_MENU = "#mat-select-1 > div > div.mat-select-value > span";
const TIME_MENU = "#mat-select-2 > div > div.mat-select-value > span";
const YEAR_IDENTIFIER = "//span[contains(., 'One Year')]";
const MONTH_IDENTIFIER = "//span[contains(., 'One Month')]";
const WEEK_IDENTIFIER = "//span[contains(., 'One Week')]";
const TWO_YEAR_IDENTIFIER = "//span[contains(., 'Two Year')]";
const MONTHLY_TOP =
  "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(1)";
let yearCheck = false;
let monthCheck = false;
let weekCheck = false;
let twoYearCheck = false;
let continueMetersFlag = false;
let continueLoadingFlag = false;
let continueVarMonthlyFlag = false;
let loggedInFlag = false;
let graphButton = "";
let first_selector_num = 0;
let PPArray = [];
let continueDetailsFlag = false;
let successDetailsFlag = false;
let monthly_top = "";
let continueDetails = 0;
let continueMeters = 0;
let continueVarLoading = 0;
let continueVarMonthly = 0;
let page = "";

(async () => {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: "new", // set to false (no quotes) for debug. Leave as "new" (with quotes) for production | reference: https://developer.chrome.com/articles/new-headless/
    args: ["--disable-features=site-per-process, --no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });
  while (!continueDetailsFlag && continueDetails < maxAttempts) {
    try {
      console.log("Accessing Pacific Power Web Page...");

      // Create a page
      page = await browser.newPage();
      await page.setDefaultTimeout(TIMEOUT_BUFFER);

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

      if (continueDetails === 0) {
        await page.waitForTimeout(25000);
        await page.waitForSelector(ACCEPT_COOKIES);
        console.log("Cookies Button found");

        await page.click(ACCEPT_COOKIES);
        await page.click(LOCATION_BUTTON);
        console.log("Location Button clicked");
      }

      // helpful for logging into sign in form within iframe: https://stackoverflow.com/questions/46529201/puppeteer-how-to-fill-form-that-is-inside-an-iframe

      if (!loggedInFlag) {
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
        loggedInFlag = true;
      } else {
        console.log("Already logged in, go to My Account");
        // Go to your site
        await page.goto("https://www.pacificpower.net/my-account.html");
      }

      // this one needs more timeout, based on results from stresstest.sh
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 60000,
      });
      console.log(await page.title());

      await page.waitForTimeout(25000);

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

      await page.waitForSelector(USAGE_DETAILS, { timeout: 60000 });
      console.log("Usage Details Link found");

      await page.click(USAGE_DETAILS);

      // this one needs more timeout, based on results from stresstest.sh
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 60000,
      });
      await page.waitForTimeout(25000);

      // it's theoretically possible to get yearly result for first meter, so check just in case
      // await page.waitForTimeout(25000);
      await page.waitForFunction(
        () => !document.querySelector("#loading-component > mat-spinner"),
      );
      console.log(await page.title());
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
        `Unknown Error en route to Energy Usage Details Page, (Attempt ${
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
      // meter_selector_num = 622;

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
          let pp_meter_id = parseInt(
            pp_meter_full_trim.slice(
              meterStringIndex + 8,
              pp_meter_full_trim.length - 2,
            ),
          );
          console.log(pp_meter_id);

          // await page.waitForSelector(
          // "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area",
          // );
          while (!continueVarMonthlyFlag && continueVarMonthly < maxAttempts) {
            try {
              await page.waitForSelector(
                "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area",
              );
              await page.waitForSelector(MONTHLY_TOP, {
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
              console.log("Time Menu Opened");
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
                    console.log("Some other error");
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
                    console.log("Some other error");
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

          continueVarMonthlyFlag = false;
          continueVarMonthly = 0;

          monthly_top = await page.waitForSelector(MONTHLY_TOP);
          console.log(
            "Monthly Data Top Row Found, getting table top row value",
          );
          let monthly_top_text = await monthly_top.evaluate(
            (el) => el.textContent,
          );
          console.log(monthly_top_text);
          let positionUsage = "Usage(kwh)"; // You can edit this value to something like "Usage(kwhdfdfd)" to test the catch block at the end
          let positionEst = "Est. Rounded";

          if (monthly_top_text.includes(positionEst)) {
            console.log("Data is not yearly. Data is probably monthly.");
          } else {
            console.log("Year Check Found, skipping to next meter");
            meter_selector_num++;
            continueVarLoading = 0;
            continue;
          }

          let usage_kwh = parseFloat(
            monthly_top_text.split(positionUsage)[1].split(positionEst)[0],
          );
          console.log(usage_kwh);

          const PPTable = {
            meter_selector_num,
            pp_meter_id,
            usage_kwh,
          };

          PPArray.push(PPTable);

          /* // for testing json output
      if (newID === 511) {
        continueMetersFlag = true;
  
        break;
      }
      */

          // If "Est. Rounded" is found, then the data is monthly.
          if (monthly_top_text.includes(positionEst)) {
            meter_selector_num++;
            continueVarLoading = 0;
          }
        } catch (error) {
          // This catch ensures that if one meter errors out, we can keep going to next meter instead of whole webscraper crashing
          console.error(error);
          console.log(
            meter_selector_num.toString() +
              " Unknown Error, Skipping to next meter",
          );
          meter_selector_num++;
          continueMeters++;
          // continue;
        }
      }
      // node readPP.js --save-output
      if (
        process.argv.includes("--save-output") ||
        process.env.SAVE_OUTPUT === "true"
      ) {
        const jsonContent = JSON.stringify(PPArray, null, 2);
        fs.writeFile("./output.json", jsonContent, "utf8", function (err) {
          if (err) {
            return console.log(err);
          }
          console.log("The file was saved!");
        });
      }
    }
  }

  // Close browser.
  await browser.close();
})();
