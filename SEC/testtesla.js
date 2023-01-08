const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 25000;
const PAGE_LOAD_TIMEOUT = 30000;
const CLICK_OPTIONS = { clickCount: 10, delay: 100 };
const MAX_TRIES = 5;

(async () => {
  console.log("Accessing Tesla Web Page...");

  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_BUFFER);

  // Login to the Tesla service
  await page.goto(process.env.TESLA_LOGINPAGE);
  console.log(await page.title());

  const USERNAME_SELECTOR = "#username";
  await page.waitForSelector(USERNAME_SELECTOR);
  await page.type(USERNAME_SELECTOR, process.env.TESLA_USERNAME);

  const PASSWORD_SELECTOR = "#password";
  await page.waitForSelector(PASSWORD_SELECTOR);
  await page.type(PASSWORD_SELECTOR, process.env.TESLA_PWD);

  const LOGIN_BUTTON_SELECTOR = '[translate="LOGIN.log_in_button"]';
  await page.waitForSelector(LOGIN_BUTTON_SELECTOR);
  const LOGIN_BUTTON = await page.$(LOGIN_BUTTON_SELECTOR);
  await LOGIN_BUTTON.click(CLICK_OPTIONS);

  console.log("Waiting for cookies to load...");

  // Wait to for success response from solar city
  await page.waitForResponse(
    (res) => res.url() === "https://mysolarcity.com/" && res.status() === 200
  );

  // Wait for the page to finish loading (guarantees cookies are loaded)
  await page.waitForNavigation({
    waitUntil: "domcontentloaded",
  });
  console.log(await page.title());

  await browser.close();
})();
