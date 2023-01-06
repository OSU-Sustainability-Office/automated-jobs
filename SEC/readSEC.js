// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require('puppeteer');
require('dotenv').config();

const TIMEOUT_BUFFER = 25000;
const PAGE_LOAD_TIMEOUT = 30000;
const CLICK_OPTIONS = {clickCount: 10, delay: 100};
const MAX_TRIES = 5;

(async () => {
  // Launch the browser
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    // executablePath: 'google-chrome-stable'
  })

  // Create a page
  const page = await browser.newPage();
  page.setDefaultTimeout(TIMEOUT_BUFFER)

  // Go to your site
  await page.goto(process.env.SEC_LOGINPAGE);

  // login to SEC
  const USERNAME_SELECTOR = '#txtUserName'
  await page.waitForSelector(USERNAME_SELECTOR)
  await page.type(USERNAME_SELECTOR, process.env.SEC_USERNAME)

  const PASSWORD_SELECTOR = '#txtPassword'
  await page.waitForSelector(PASSWORD_SELECTOR)
  await page.type(PASSWORD_SELECTOR, process.env.SEC_PWD)

  const LOGIN_BUTTON_SELECTOR = '#ctl00_ContentPlaceHolder1_Logincontrol1_LoginBtn'
  await page.waitForSelector(LOGIN_BUTTON_SELECTOR)
  const LOGIN_BUTTON = await page.$(LOGIN_BUTTON_SELECTOR)
  await LOGIN_BUTTON.click(CLICK_OPTIONS)

  console.log("Waiting for cookies to load...")

  //const TEST_SELECTOR = '#content > div > h2'
  //await page.waitForSelector(TEST_SELECTOR)

  /*
  await page.waitForResponse(
    (res) => 
      (res.url() === 'https://www.sunnyportal.com/') && (res.status() === 200)
  )
*/

  // await page.waitForTimeout(PAGE_LOAD_TIMEOUT)

  // Evaluate JavaScript
  const three = await page.evaluate(() => {
    return 1 + 2;
  });

  console.log(three);

  // Close browser.
  await browser.close();
})();