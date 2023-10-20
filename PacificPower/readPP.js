// https://pptr.dev/guides/evaluate-javascript

// Import puppeteer

const puppeteer = require("puppeteer");
require("dotenv").config();

const TIMEOUT_BUFFER = 600000; // lower to 15000 for debug
const axios = require("axios");

(async () => {
  console.log("Accessing Pacific Power Web Page...");

  // Launch the browser
  browser = await puppeteer.launch({
    headless: "new", // set to false (no quotes) for debug | reference: https://developer.chrome.com/articles/new-headless/
    args: ["--disable-features=site-per-process, --no-sandbox"],
    // executablePath: 'google-chrome-stable'
  });

  // Create a page
  const page = await browser.newPage();
  await page.setDefaultTimeout(TIMEOUT_BUFFER);
  const maxAttempts = 5;
  let attempt = 0;

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
  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.click(ACCEPT_COOKIES);
      console.log("Cookies Button clicked");
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

  const LOCATION_BUTTON = "a.modalCloseButton";

  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.click(LOCATION_BUTTON);
      console.log("Location Button clicked");
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Location Button not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  const SIGN_IN_PAGE_BUTTON = "a.link.link--default.link--size-default.signin";
  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.click(SIGN_IN_PAGE_BUTTON);
      await page.waitForNavigation({ waitUntil: "networkidle0" });
      console.log("SignIn Page Button Clicked!");
      console.log(await page.title());
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

  // helpful for logging into sign in form within iframe: https://stackoverflow.com/questions/46529201/puppeteer-how-to-fill-form-that-is-inside-an-iframe

  console.log("waiting for iframe with form to be ready.");
  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.waitForSelector("iframe");
      console.log("iframe is ready. Loading iframe content");
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Iframe not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  const elementHandle = await page.$(
    'iframe[src="/oauth2/authorization/B2C_1A_PAC_SIGNIN"]',
  );
  const frame = await elementHandle.contentFrame();

  console.log("filling username in iframe");

  // may need to change these 5000 value timeouts later to something less arbitrary, increase timeout, or ideally wait until completion
  //await page.waitForTimeout(5000);
  await frame.type("input#signInName", process.env.PP_USERNAME);

  console.log("filling password in iframe");
  await frame.type("input#password", process.env.PP_PWD);

  const LOGIN_BUTTON = "button#next";
  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await frame.click(LOGIN_BUTTON);
      await page.waitForNavigation({ waitUntil: "networkidle0" });
      console.log("Login Button clicked");
      console.log(await page.title());
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

  const USAGE_DETAILS = "a.usage-link";
  // await page.waitForTimeout(5000);
  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.click(USAGE_DETAILS); // does this still error sometimes? increase timeout?
      await page.waitForNavigation({ waitUntil: "networkidle0" });
      console.log("Usage Details Link clicked");
      console.log(await page.title());
      break; // Exit the loop if successful
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

  // await page.waitForTimeout(15000);

  // reference: https://stackoverflow.com/a/66461236
  /*
  let [timeframeMenu] = await page.$x("//span[contains(., 'One Month')]");
  if (timeframeMenu) {
    await timeframeMenu.click();
    console.log("Opened timeframe menu");
  }
  await page.waitForTimeout(5000);
  [timeframeMenu] = await page.$x("//span[contains(., 'One Day')]");
  if (timeframeMenu) {
    await timeframeMenu.click();
    console.log("Selected One Day");
  }
  */
  // await page.click('#mat-option-508')
  // the month / day values will increment the ID if you change options on the building menu
  // the building menu ID's should stay constant (unless refresh page)

  // await page.waitForTimeout(5000);

  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.click(
        "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > a:nth-child(3)",
      );
      console.log(
        "Energy Usage Link clicked, switched from graph to table view",
      );
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Energy Usage Link not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  /*
  for (let i = 1; i <= 96; i++) {
    let element = await page.waitForSelector(
      "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > table > tbody > tr:nth-child(" +
        i +
        ") > div:nth-child(1)",
    ); // select the element
    let value = await element.evaluate((el) => el.textContent); // grab the textContent from the element, by evaluating this function in the browser context
    let formattedValue =
      value.slice(0, 8) +
      ": " +
      value.slice(8, 13) +
      ", " +
      value.slice(13, 23) +
      ": " +
      value.slice(23);
    console.log(formattedValue);
  }
  */
  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      await page.waitForSelector(
        "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(1)",
      );
      console.log("Monthly Data Top Row Found, getting table top row value");
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Monthly Data Top Row not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;
  let element = await page.waitForSelector(
    "#main > wcss-full-width-content-block > div > wcss-myaccount-energy-usage > div:nth-child(5) > div.usage-graph-area > div:nth-child(2) > div > div > div > div > table > tbody > tr:nth-child(1)",
  ); // select the element
  let value = await element.evaluate((el) => el.textContent); // grab the textContent from the element, by evaluating this function in the browser context
  let positionUsage = "Usage(kwh)";
  let positionEst = "Est. Rounded";
  let formattedValue = parseFloat(
    value.split(positionUsage)[1].split(positionEst)[0],
  );
  console.log(value);
  console.log(formattedValue);

  const element2 = await page.waitForSelector(
    "#mat-select-1 > div > div.mat-select-value > span",
  ); // select the element
  const value2 = await element2.evaluate((el) => el.textContent); // grab the textContent from the element, by evaluating this function in the browser context
  console.log(value2);

  await page.click("#mat-select-1 > div > div.mat-select-value > span");
  console.log("Meter Menu Opened");

  // let [timeframeMenu] = await page.$x("//span[contains(., '" + value2 + "')]");

  // const value3 = await timeframeMenu.evaluate(el => el.textContent); // grab the textContent from the element, by evaluating this function in the browser context
  // console.log(value3);

  // const n = await page.$("#mat-active")
  //get class attribute

  // https://www.tutorialspoint.com/puppeteer/puppeteer_getting_element_attribute.htm

  while (attempt < maxAttempts) {
    try {
      await page.waitForTimeout(1000);
      let topID = await page.$eval("mat-option", (el) => el.getAttribute("id"));
      console.log(topID);
      console.log(topID.slice(11));
      newID = topID.slice(0, 11) + (parseInt(topID.slice(11)) + 1).toString();
      console.log(newID);
      console.log("Meter ID Found");
      break; // Exit the loop if successful
    } catch (error) {
      console.log(
        `Meter ID not found (Attempt ${
          attempt + 1
        } of ${maxAttempts}). Retrying...`,
      );
      attempt++;
    }
  }

  attempt = 0;

  // const selector = await page.$(".mat-option ng-star-inserted mat-active")
  // const links = await selector.$eval((el) => el.id);
  // console.log(links)

  // let [timeframeMenu] = await page.$x("//span[contains(., '" + value2 + "')]");

  /*
  if (timeframeMenu) {
    await timeframeMenu.click();
    console.log(timeframeMenu)
  }
  */

  await page.waitForTimeout(100000); // arbitarily long timeout for debug

  // implement some loops with:
  // each building of building menu
  // each 15? minutes in Kwh table (per building)

  // need to format text strings in output

  // Close browser.
  await browser.close();
})();
