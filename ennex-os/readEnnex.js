// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 600000; // lower to 10000 for debug
const axios = require("axios");
const meterlist = require("./meterlist.json");

(async () => {
  console.log("Accessing EnnexOS Web Page...");

  // Launch the browser
  browser = await puppeteer.launch({
    headless: "new", // set to false (no quotes) for debug | reference: https://developer.chrome.com/articles/new-headless/
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  const page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

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

  const ACCEPT_COOKIES = "#onetrust-accept-btn-handler";
  const LOGIN_BUTTON = "#login > button";
  const PV_tableData = [];

  await page.waitForTimeout(25000);
  await page.waitForSelector(ACCEPT_COOKIES);
  console.log("Cookies Button found");

  await page.click(ACCEPT_COOKIES);

  await page.waitForTimeout(10000);

  // login to ennexOS
  const USERNAME_SELECTOR = "#mat-input-0";
  await page.waitForSelector(USERNAME_SELECTOR);
  console.log("found username selector");
  await page.type(USERNAME_SELECTOR, process.env.SEC_USERNAME);

  const PASSWORD_SELECTOR = "#mat-input-1";
  await page.waitForSelector(PASSWORD_SELECTOR);
  console.log("found password selector");
  await page.type(PASSWORD_SELECTOR, process.env.SEC_PWD);

  const maxAttempts = 5;
  let attempt = 0;

  // non-unix time calc
  const dateObj = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const localeTime = dateObj
    .toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    .match(/\d+/g);
  const DATE =
    localeTime[2] + "-" + localeTime[0] + "-" + Number(localeTime[1]);
  const END_TIME = `${DATE}T23:59:59`;
  console.log(END_TIME);

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
  const ENNEX_DATE = ENNEX_MONTH + "/" + ENNEX_DAY + "/" + localeTime[2];
  console.log(ENNEX_DATE);

  // unix time calc
  dateObj.setUTCHours(23, 59, 59, 0);
  const END_TIME_SECONDS = Math.floor(dateObj.valueOf() / 1000).toString();

  console.log(END_TIME_SECONDS);

  while (attempt < maxAttempts) {
    try {
      await page.click(LOGIN_BUTTON);
      await page.waitForNavigation({ waitUntil: "networkidle0" });
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
  console.log(await page.title());
  await page.waitForTimeout(25000);

  for (let j = 0; j < meterlist.length; j++) {
    const meterName = meterlist[j].meterName;

    const meterID = meterlist[j].meterID;

    const time = END_TIME;

    const time_seconds = END_TIME_SECONDS;

    await page.goto(
      process.env.SEC_LOGINPAGE +
        "/" +
        meterlist[j].linkSuffix +
        "/monitoring/view-energy-and-power",
      {
        waitUntil: "networkidle0",
      },
    );

    console.log(await page.title());

    await page.waitForTimeout(25000);

    // details tab
    await page.waitForSelector(
      "body > sma-ennexos > div > mat-sidenav-container > mat-sidenav-content > div > div > sma-energy-and-power > sma-energy-and-power-container > div > div > div > div.ng-star-inserted > div.sma-main.ng-star-inserted > sma-advanced-chart > div > div > mat-accordion",
    );
    console.log("Details Tab found");
    await page.click(
      "body > sma-ennexos > div > mat-sidenav-container > mat-sidenav-content > div > div > sma-energy-and-power > sma-energy-and-power-container > div > div > div > div.ng-star-inserted > div.sma-main.ng-star-inserted > sma-advanced-chart > div > div > mat-accordion",
    );
    await page.waitForTimeout(25000);

    // monthly tab
    await page.waitForSelector("#mat-tab-label-0-2 > div > div");
    console.log("Monthly Tab found");
    await page.click("#mat-tab-label-0-2 > div > div");
    await page.waitForTimeout(25000);

    let [ennexMeterName] = await page.$x(
      '//*[@id="header"]/sma-navbar/sma-navbar-container/nav/div[1]/sma-nav-node/div/sma-nav-element/div/div[2]/span',
    );

    // might be redundant but it's a sanity check that the meter name is what we expect
    let PVSystem = await page.evaluate((el) => el.innerText, ennexMeterName);
    console.log("\n" + PVSystem);

    let abort = false;
    let dayIterator = 2;

    while (!abort && dayIterator < 33) {
      while (attempt < 1) {
        try {
          let lastMonth =
            "#advanced-chart-detail-table > div > div.sma-detail-table-container.ng-star-inserted > mat-table > mat-row:nth-child(" +
            dayIterator +
            ")";
          await page.waitForSelector(lastMonth, {
            timeout: 25000,
          });
          console.log(dayIterator);
          let [lastMonthReading] = await page.$x(
            '//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
              dayIterator +
              "]/mat-cell[2]",
          );
          let totalYieldYesterday = await page.evaluate(
            (el) => el.innerText,
            lastMonthReading,
          );
          console.log(totalYieldYesterday);

          let [lastDate] = await page.$x(
            '//*[@id="advanced-chart-detail-table"]/div/div[2]/mat-table/mat-row[' +
              dayIterator +
              "]/mat-cell[1]",
          );
          let lastDate_full = await page.evaluate(
            (el) => el.innerText,
            lastDate,
          );
          console.log(lastDate_full);

          const PVTable = {
            meterName,
            meterID,
            time,
            time_seconds,
            PVSystem,
            totalYieldYesterday,
          };

          // Break loop and push data when you get to yesterday's date (most recent full day's worth of data)
          if (ENNEX_DATE === lastDate_full) {
            console.log("it is this date");
            PV_tableData.push(PVTable);
          }

          break;
        } catch (error) {
          console.log(`Data for this day not found.`);
          attempt++;
        }
        // no point in checking multiple attempts, if the frontend state didn't load it's already too late
        // for now just add a big timeout after clicking each of the "Details" / "Monthly" tabs
        // potential TODO: identify loading animations and wait for those to disappear, or some other monthly indicator
        if (attempt == 1) {
          console.log("Moving on to next meter (if applicable)");
          abort = true;
          break;
        }
      }
      dayIterator++;
      attempt = 0;
    }
  }
  const comboTotalYieldYesterday = (
    parseFloat(PV_tableData[0].totalYieldYesterday) +
    parseFloat(PV_tableData[1].totalYieldYesterday)
  ).toFixed(2);

  // put osu operations and osu operations lube shop into combined object. A meter group would probably be better for future meters
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
  let final_PV_tableData = PV_tableData.slice(2);

  const solarmeter = "Solar_Meters";

  for (let i = 0; i < final_PV_tableData.length; i++) {
    console.log(final_PV_tableData[i]);

    // Comment out the axios POST request as specified below for local development (unless making changes to upload stuff).
    // Uncomment this section before pushing to production.
    /* block comment starts here
    await axios({
      method: "post",
      url: `${process.env.DASHBOARD_API}/upload`,
      data: {
        id: solarmeter,
        body: final_PV_tableData[i],
        pwd: process.env.API_PWD,
        type: "solar",
      },
    })
      .then((res) => {
        console.log(
          `RESPONSE: ${res.status}, TEXT: ${res.statusText}, DATA: ${res.data}`,
        );
        console.log(`uploaded ${solarmeter} data to API`);
      })
      .catch((err) => {
        console.log(err);
      });
    */ //block comment ends here
  }

  // Close browser.
  await browser.close();
})();
