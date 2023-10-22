// https://pptr.dev/guides/evaluate-javascript

// Lower timeouts (other than setDefaultTimeout) from 10000 to 1000 for debug

// Prod may be better on 25s to be safe (25000 ms), needs more testing

// armchair math:
// There are currently 8 one-time pauses and 2 pauses recurring in while loop
// 10s pause = ((10 * 8) + (10 * 2 * 114)) / 60 = 39.33 minutes
//  - Real time experiment: 42 minutes with all 10s pause
// 25s pause = ((25 * 8) + (25 * 2 * 114)) / 60 = 98.33 minutes
// First 8 pauses at 25s, last 2 recurring pauses 10s = 41.33 minutes
// probably a bit longer than that of course, that is purely from the waitforTimeouts

// The various timeouts and while loops + try/catch blocks on this page are probably overkill, but the errors seem to show up at
// random (based on Internet speed etc), so better safe than sorry for production. You can lower the timeouts for debug.

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 7200000; // Currently set for 2 hours (7,200,000 ms), based on 42 minutes actual result as noted above
const axios = require("axios");
const fs = require("fs");

(async () => {
  console.log("Accessing Pacific Power Web Page...");

  // Launch the browser
  browser = await puppeteer.launch({
    headless: "new", // set to false (no quotes) for debug. Leave as "new" (with quotes) for production | reference: https://developer.chrome.com/articles/new-headless/
    args: ["--disable-features=site-per-process, --no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  const page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);
  const maxAttempts = 5;
  let attempt = 0;
  let meter_selector_full = "";
  let meter_selector_num = "";
  const ACCEPT_COOKIES = "button.cookie-accept-button";
  const LOCATION_BUTTON = "a.modalCloseButton"; // button for closing a popup about what state you're in

  // This is the button that takes you to the sign in page, not the button you press to actually log in
  const SIGN_IN_PAGE_BUTTON = "a.link.link--default.link--size-default.signin";

  const SIGN_IN_IFRAME =
    'iframe[src="/oauth2/authorization/B2C_1A_PAC_SIGNIN"]';
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
  const YEAR_IDENTIFIER = "//span[contains(., 'One Year')]";
  const MONTH_IDENTIFIER = "//span[contains(., 'One Month')]";
  const MONTHLY_TOP =
    "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(1)";
  let yearCheck = false;
  let monthCheck = false;
  let abort = false;

  // Go to your site
  await page.goto(process.env.PP_LOGINPAGE, { waitUntil: "networkidle0" });

  // next two lines to make sure it works the same with headless on or off: https://github.com/puppeteer/puppeteer/issues/665#issuecomment-481094738
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36",
  );
  console.log(await page.title());

  await page.waitForTimeout(10000);
  await page.waitForSelector(ACCEPT_COOKIES);
  console.log("Cookies Button found");

  await page.click(ACCEPT_COOKIES);
  await page.click(LOCATION_BUTTON);
  console.log("Location Button clicked");

  await page.click(SIGN_IN_PAGE_BUTTON);
  console.log("SignIn Page Button Clicked!");

  // Putting the networkidle0 stuff in the try catch block seemed to cause more crashes, but this is unclear
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  console.log(await page.title());

  // helpful for logging into sign in form within iframe: https://stackoverflow.com/questions/46529201/puppeteer-how-to-fill-form-that-is-inside-an-iframe

  console.log("waiting for iframe with form to be ready.");
  await page.waitForTimeout(10000);
  await page.waitForSelector("iframe");
  console.log("iframe is ready. Loading iframe content");

  const signin_iframe = await page.$(SIGN_IN_IFRAME);
  const frame = await signin_iframe.contentFrame();

  console.log("filling username in iframe");

  await frame.type(SIGN_IN_INPUT, process.env.PP_USERNAME);

  console.log("filling password in iframe");
  await frame.type(SIGN_IN_PASSWORD, process.env.PP_PWD);

  await frame.click(LOGIN_BUTTON);
  console.log("Login Button clicked");

  await page.waitForNavigation({ waitUntil: "networkidle0" });
  console.log(await page.title());

  while (attempt < maxAttempts) {
    try {
      await page.waitForSelector(USAGE_DETAILS, { timeout: 10000 });
      console.log("Usage Details Link found");
      break;
    } catch (error) {
      console.log(
        `Usage Details Link not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  await page.click(USAGE_DETAILS);
  await page.waitForNavigation({ waitUntil: "networkidle0" });

  // it's theoretically possible to get yearly result for first meter, so check just in case
  // await page.waitForTimeout(10000);
  console.log(await page.title());
  while (attempt < maxAttempts) {
    try {
      [yearCheck] = await page.$x(YEAR_IDENTIFIER, { timeout: 5000 });
      [monthCheck] = await page.$x(MONTH_IDENTIFIER, { timeout: 5000 });
      console.log("Year / Month Check found");
      if ((!yearCheck && !monthCheck) || (yearCheck && monthCheck)) {
        throw "try again";
      }
      break;
    } catch (error) {
      console.log(
        `Year / Month Check not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  let graphButton = "";

  if (yearCheck && !monthCheck) {
    graphButton = GRAPH_TO_TABLE_BUTTON_YEARLY;
  } else if (!yearCheck && monthCheck) {
    graphButton = GRAPH_TO_TABLE_BUTTON_MONTHLY;
  }

  await page.waitForTimeout(10000);
  await page.waitForSelector(graphButton);
  console.log("Graph to Table Button clicked");

  await page.click(graphButton);

  await page.waitForTimeout(10000);
  await page.waitForSelector(METER_MENU);
  console.log("Meter Menu Opened");

  await page.click(METER_MENU);

  await page.waitForTimeout(10000);
  meter_selector_full = await page.$eval("mat-option", (el) =>
    el.getAttribute("id"),
  );
  meter_selector_num = parseInt(meter_selector_full.slice(11));
  // console.log(meter_selector_full);
  console.log("Meter ID Found");

  await page.click(METER_MENU);
  console.log("Meter Menu Closed");

  // one time pause after closing menu before the while loops, just in case
  await page.waitForTimeout(10000);

  let PPArray = [];

  console.log("\nLogs are recurring after this line");

  // testing at specific meter ID, e.g. to see if termination behavior works
  // meter_selector_num = 510

  while (!abort) {
    try {
      await page.waitForSelector(METER_MENU);
      console.log("\n" + meter_selector_num.toString());
      await page.click(METER_MENU);
      console.log("Meter Menu Opened");

      await page.waitForTimeout(10000);
      await page.waitForSelector(
        "#" + meter_selector_full.slice(0, 11) + meter_selector_num.toString(),
      );
      console.log("New Meter Opened");

      await page.click(
        "#" + meter_selector_full.slice(0, 11) + meter_selector_num.toString(),
      );

      let monthly_top = "";
      await page.waitForTimeout(20000);
      while (attempt < maxAttempts) {
        try {
          await page.waitForSelector(MONTHLY_TOP, { timeout: 10000 });
          console.log(
            "Monthly Data Top Row Found, getting table top row value",
          );
          break;
        } catch (error) {
          console.log(
            `monthly top row not found (Attempt ${
              attempt + 1
            } of ${maxAttempts}). Retrying...`,
          );
          attempt++;
        }
      }

      if (attempt === maxAttempts) {
        console.log("No Data Found, Stopping Webscraper");
        abort = true;
        break;
      }

      attempt = 0;

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

      monthly_top = await page.waitForSelector(MONTHLY_TOP);
      let monthly_top_text = await monthly_top.evaluate((el) => el.textContent);
      console.log(monthly_top_text);
      let positionUsage = "Usage(kwh)"; // You can edit this value to something like "Usage(kwhdfdfd)" to test the catch block at the end
      let positionEst = "Est. Rounded";

      if (monthly_top_text.includes(positionEst)) {
        console.log("Data is not yearly. Data is probably monthly.");
      } else {
        console.log("Year Check Found, skipping to next meter");
        meter_selector_num += 1;
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
      abort = true;

      break;
    }
    */

      // If "Est. Rounded" is found, then the data is monthly.
      if (monthly_top_text.includes(positionEst)) {
        meter_selector_num += 1;
      }
    } catch (error) {
      // This catch ensures that if one meter errors out, we can keep going to next meter instead of whole webscraper crashing
      console.error(error);
      console.log(
        meter_selector_num.toString() +
          " Unknown Error, Skipping to next meter",
      );
      meter_selector_num += 1;
      continue;
    }
  }

  // Close browser.
  const jsonContent = JSON.stringify(PPArray, null, 2);

  // node readPP.js --save-output
  if (
    process.argv.includes("--save-output") ||
    process.env.SAVE_OUTPUT === "true"
  ) {
    fs.writeFile("./output.json", jsonContent, "utf8", function (err) {
      if (err) {
        return console.log(err);
      }
      console.log("The file was saved!");
    });
  }
  await browser.close();
})();
