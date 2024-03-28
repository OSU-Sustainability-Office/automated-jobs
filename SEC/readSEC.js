// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require("puppeteer");
require("dotenv").config();
const meterlist = require("./meterlist.json");

const TIMEOUT_BUFFER = 600000; // lower to 10000 for debug
const axios = require("axios");

(async () => {
  console.log("Accessing SEC Web Page...");

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

  // login to SEC
  const USERNAME_SELECTOR = "#txtUserName";
  await page.waitForSelector(USERNAME_SELECTOR);
  await page.type(USERNAME_SELECTOR, process.env.SEC_USERNAME);

  const PASSWORD_SELECTOR = "#txtPassword";
  await page.waitForSelector(PASSWORD_SELECTOR);
  await page.type(PASSWORD_SELECTOR, process.env.SEC_PWD);

  const ACCEPT_COOKIES = "#onetrust-accept-btn-handler";
  const LOGIN_BUTTON = "#ctl00_ContentPlaceHolder1_Logincontrol1_LoginBtn";

  const maxAttempts = 5;
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      await page.click(ACCEPT_COOKIES);
      // wait for the await cookies div to disappear
      await page.waitForTimeout(25000);
      console.log("Cookies Button Clicked!");
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Accept Cookies Button not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  while (attempt < maxAttempts) {
    try {
      await page.click(LOGIN_BUTTON);
      await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 25000,
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

  console.log("Logged in!");
  console.log(await page.title());

  // non-unix time calc
  const dateObj = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const localeTime = dateObj
    .toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    .match(/\d+/g);
  const DATE =
    localeTime[2] + "-" + localeTime[0] + "-" + Number(localeTime[1]);
  const END_TIME = `${DATE}T23:59:59`;

  // Automatically detects the timezone difference of US Pacific vs GMT-0 (7 or 8 depending on daylight savings)
  // https://stackoverflow.com/questions/20712419/get-utc-offset-from-timezone-in-javascript
  const getOffset = (timeZone) => {
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
  };

  console.log(getOffset("US/Pacific"));
  const dateObjUnix = new Date(
    new Date().getTime() -
      (24 * 60 * 60 * 1000 + getOffset("US/Pacific") * 60 * 1000),
  );

  // unix time calc
  dateObjUnix.setUTCHours(23, 59, 59, 0);
  const END_TIME_SECONDS = Math.floor(dateObjUnix.valueOf() / 1000).toString();

  console.log(END_TIME_SECONDS);

  // https://stackoverflow.com/questions/62452376/scraping-a-table-with-puppeteer-how-can-i-format-each-td-element-as-an-object-p
  const PV_tableData = [];

  // https://stackoverflow.com/questions/59686300/how-to-get-text-from-xpath-in-puppeteer-node-js
  for (let i = 0; i < meterlist.length; i++) {
    const meterName = meterlist[i].meterName;

    const meterID = meterlist[i].meterID;

    const time = END_TIME;

    const time_seconds = END_TIME_SECONDS;

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
  }

  const solarmeter = "Solar_Meters";

  for (let i = 0; i < PV_tableData.length; i++) {
    console.log(PV_tableData[i]);

    // Use the --no-upload flag to prevent uploading to the API for local development/testing
    // node readSEC.js --no-upload
    if (!process.argv.includes("--no-upload")) {
      await axios({
        method: "post",
        url: `${process.env.DASHBOARD_API}/upload`,
        data: {
          id: solarmeter,
          body: PV_tableData[i],
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
    }
  }

  // Close browser.
  await browser.close();
})();
