// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 120000;
const CLICK_OPTIONS = { clickCount: 10, delay: 100 };
const MAX_TRIES = 5;
const axios = require("axios");

(async () => {
  console.log("Accessing SEC Web Page...");

  // Launch the browser
  browser = await puppeteer.launch({
    headless: true, // set to false for debug
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  const page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

  // Go to your site
  await page.goto(process.env.SEC_LOGINPAGE, { waitUntil: "networkidle2" });

  // next two lines to make sure it works the same with headless on or off: https://github.com/puppeteer/puppeteer/issues/665#issuecomment-481094738
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9",
  });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36"
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

  await page.click(ACCEPT_COOKIES); // click accept cookies
  console.log("Waiting for Accept Cookies Button...");
  await page.waitForSelector("#onetrust-banner-sdk > div", { hidden: true }); // wait for the await cookies div to disappear
  console.log("Cookies Button Clicked!");
  await page.click(LOGIN_BUTTON);
  await page.waitForNavigation({ waitUntil: "networkidle2" });

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

  // unix time calc
  const dateObj_Seconds = new Date();
  const end_time_raw = new Date(
    new Date(
      dateObj_Seconds.getFullYear(),
      dateObj_Seconds.getMonth(),
      dateObj_Seconds.getDate()
    ) - 1
  );
  const END_TIME_SECONDS = Math.floor(end_time_raw.valueOf() / 1000).toString();

  // https://stackoverflow.com/questions/62452376/scraping-a-table-with-puppeteer-how-can-i-format-each-td-element-as-an-object-p
  const PV_tableData = [];
  class PVTable {
    constructor(tableID, time, time_seconds, PVSystem, totalYieldYesterday) {
      this.tableID = tableID;
      this.time = time;
      this.time_seconds = time_seconds;
      this.PVSystem = PVSystem;
      this.totalYieldYesterday = totalYieldYesterday;
    }
  }

  // array with list of ID for each row
  const tableRows = [
    "3080beca-6c32-4e74-9a8b-3e8490ce5d37",
    "d4d43f97-e171-4ba0-9570-6731a66bc32c",
    "a67b3f74-acd1-4119-ab92-24b9bc3c7c60",
  ];

  const tableIDNames = ["SEC_OSU_Op_Lube", "SEC_OSU_Op", "SEC_Solar"];

  // https://stackoverflow.com/questions/59686300/how-to-get-text-from-xpath-in-puppeteer-node-js
  for (let i = 0; i <= tableRows.length - 1; i++) {
    const tableID = tableIDNames[i];
    //console.log(tableID);

    const time = END_TIME;

    const time_seconds = END_TIME_SECONDS;

    await page.waitForXPath("//*[@id='" + tableRows[i] + "']/td[1]/a"); // wait and make sure xpaths loaded
    console.log("x-paths loaded!");

    const PVSystem = await page.evaluate(
      (el) => el.innerText,
      (
        await page.$x("//*[@id='" + tableRows[i] + "']/td[1]/a")
      )[0]
    );

    const totalYieldYesterdayElement = await page.$x(
      "//*[@id='" + tableRows[i] + "']/td[3]"
    );
    const totalYieldYesterday = await page.evaluate(
      (el) => el.innerText.replace(",", ""),
      totalYieldYesterdayElement[0]
    );

    const actualPVTable = {
      tableID,
      time,
      time_seconds,
      PVSystem,
      totalYieldYesterday,
    };

    PV_tableData.push(actualPVTable);
  }

  // Comment out line below before pushing to production, it is redundant with the Upload code in terms of logging responses.
  console.log(PV_tableData);

  const solarmeter = "Solar_Meters";

  // Comment out code below for local development (unless making changes to upload stuff).
  // Uncomment code below before pushing to production.
  /*
  for (let i = 0; i < PV_tableData.length; i++) {
    //console.log(PV_tableData[i].tableID);
    //console.log(table2DArray)
    console.log(PV_tableData[i])
    await axios({
      method: 'post',
      url: `${process.env.DASHBOARD_API}/upload`,
      data: {
          id: solarmeter,
          body: PV_tableData[i],
          pwd: process.env.API_PWD,
          type: 'solar'
      }
  }).then(res => {
      console.log(`RESPONSE: ${res.status}, TEXT: ${res.statusText}, DATA: ${res.data}`)
      console.log(`uploaded ${solarmeter} data to API`)
      
  }).catch(err => {
      console.log(err)
  })
  }
  */

  // Close browser.
  await browser.close();
})();
