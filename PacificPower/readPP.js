// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 15000; // lower to 15000 for debug
const axios = require("axios");

(async () => {
  console.log("Accessing Pacific Power Web Page...");

  // Launch the browser
  browser = await puppeteer.launch({
    headless: false, // set to false (no quotes) for debug | reference: https://developer.chrome.com/articles/new-headless/
    args: ["--disable-features=site-per-process, --no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  const page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);

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

  // might try while loops like in SEC/readSEC.js later if needed, or use xpath - https://stackoverflow.com/questions/58087966/how-to-click-element-in-puppeteer-using-xpath
  // test with headless false or incognito for reset cookies. Remember to fully re open incognito window

  const ACCEPT_COOKIES = "button.cookie-accept-button";
  await page.click(ACCEPT_COOKIES);

  const LOCATION_BUTTON = "a.modalCloseButton";

  await page.click(LOCATION_BUTTON);

  const SIGN_IN_PAGE_BUTTON = "a.link.link--default.link--size-default.signin";
  await page.click(SIGN_IN_PAGE_BUTTON);
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  console.log("Login Button Clicked!");
  console.log(await page.title());

  // helpful for logging into sign in form within iframe: https://stackoverflow.com/questions/46529201/puppeteer-how-to-fill-form-that-is-inside-an-iframe

  console.log("waiting for iframe with form to be ready.");
  await page.waitForSelector("iframe");
  console.log("iframe is ready. Loading iframe content");

  const elementHandle = await page.$(
    'iframe[src="/oauth2/authorization/B2C_1A_PAC_SIGNIN"]',
  );
  const frame = await elementHandle.contentFrame();

  console.log("filling username in iframe");
  await frame.type("input#signInName", process.env.PP_USERNAME);

  console.log("filling password in iframe");
  await frame.type("input#password", process.env.PP_PWD);

  const LOGIN_BUTTON = "button#next";
  await frame.click(LOGIN_BUTTON);
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  console.log(await page.title());

  const USAGE_DETAILS = "a.usage-link";
  await page.click(USAGE_DETAILS);
  await page.waitForNavigation({ waitUntil: "networkidle0" });
  console.log(await page.title());

  // Close browser.
  await browser.close();
})();
