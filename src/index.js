const { plugin } = require('puppeteer-with-fingerprints');
const fs = require("fs");
const config = require('./config');
const log = require('./Utils/log');
const recMail = require('./Utils/recMail');
const axios = require('axios');

async function start() {
  console.clear();

  log("Starting...", "green");

  log("Fetching Fingerprint...", "yellow");
  plugin.setServiceKey('');
  let fingerprint;
  try {
    fingerprint = await plugin.fetch({
      tags: ['Microsoft Windows', 'Chrome'],
    });
    
    // Validate that we got a proper fingerprint
    if (!fingerprint || typeof fingerprint !== 'object' || Object.keys(fingerprint).length === 0) {
      throw new Error('Invalid fingerprint received');
    }
    
    // Additional check for promotional messages that might be returned by the service
    if (typeof fingerprint === 'string' && fingerprint.includes('Filters by tags')) {
      throw new Error('Fingerprint service returned promotional message');
    }
    
    log("Applying Fingerprint...", "yellow");
    plugin.useFingerprint(fingerprint);
    
    log("Fingerprint fetched and applied", "green");
  } catch (error) {
    if (error.message.includes('aborted') || error.message.includes('timeout')) {
      log("Failed to fetch fingerprint: " + error.message, "red");
      log("This may be due to network connectivity issues or service unavailability.", "red");
      log("Continuing with default browser settings...", "yellow");
    } else if (error.message.includes('Filters by tags') || error.message.includes('promotional')) {
      // Handle the specific case where the service returns promotional text
      log("Fingerprint service returned promotional message. Continuing without fingerprint.", "yellow");
    } else {
      log("Failed to fetch fingerprint: " + error.message, "red");
      log("Continuing with default browser settings...", "yellow");
    }
    // Continue with default browser settings if fingerprint fetching fails
    fingerprint = null;
  }

  if (config.USE_PROXY) {
    log("Applying proxy settings...", "green");
    plugin.useProxy(`${config.PROXY_USERNAME}:${config.PROXY_PASSWORD}@${config.PROXY_IP}:${config.PROXY_PORT}`, {
      detectExternalIP: true,
      changeGeolocation: true,
      changeBrowserLanguage: true,
      changeTimezone: true,
      changeWebRTC: true,
    });
    log("Proxy settings applied", "green");
  }

  log("Launching browser...", "green");
  const browser = await plugin.launch({
    headless: false
  });
  const page = await browser.newPage();
  await page.setDefaultTimeout(360000);

  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  log(`Viewport: [Width: ${viewport.width} Height: ${viewport.height}]`, "green");

  // Check if the viewport is bigger than the current resolution.
  const { getCurrentResolution } = await import("win-screen-resolution");
  if (viewport.width > getCurrentResolution().width || viewport.height > getCurrentResolution().height) {
    log("Viewport is bigger than the current resolution, restarting...", "red");
    await delay(5000);
    await page.close();
    await browser.close();
    start();
  }

  await createAccount(page);
  await page.close();
  await browser.close();
  process.exit(0);

}

async function createAccount(page) {
  // Going to Outlook register page.
  await page.goto("https://signup.live.com/signup?lic=1&uaid=b4ac39f4a2264fff82a3a0349402c47c");
  await page.waitForSelector(SELECTORS.USERNAME_INPUT);

  // Generating Random Personal Info.
  const PersonalInfo = await generatePersonalInfo();

  // Email
  log("Entering email...", "green");
  log(`Attempting to fill email field with: ${PersonalInfo.email}`, "yellow");
  
  // Debug: Log all available input fields on the page
  try {
    const allInputs = await page.$$eval('input', inputs => inputs.map(i => i.id || i.name || i.type));
    log(`Available input fields: ${allInputs.join(', ')}`, "yellow");
  } catch (debugError) {
    log(`Could not retrieve input fields: ${debugError.message}`, "yellow");
  }
  
  try {
    // Simple wait using existing delay function
    await delay(1000);
    log("Page ready, waiting for email input...", "yellow");
    await page.waitForSelector(SELECTORS.USERNAME_INPUT, { timeout: 10000 });
    log("Email input found", "green");
    
    // Fill the field
    await page.type(SELECTORS.USERNAME_INPUT, PersonalInfo.email);
    log("Email field filled", "green");
    
    // Press enter
    await page.keyboard.press("Enter");
    log("Pressed Enter after email", "green");
  } catch (error) {
    log(`Error filling email field: ${error.message}`, "red");
    log("Attempting alternative approach...", "yellow");
    // Try alternative approach - wait a bit and retry
    await delay(2000);
    try {
      // Simple wait using existing delay function
      await delay(1000);
      await page.waitForSelector(SELECTORS.USERNAME_INPUT, { timeout: 10000 });
      
      // Fill the field again
      await page.type(SELECTORS.USERNAME_INPUT, PersonalInfo.email);
      log("Email field filled (retry)", "green");
      
      await page.keyboard.press("Enter");
      log("Pressed Enter after email (retry)", "green");
    } catch (retryError) {
      log(`Retry failed for email field: ${retryError.message}`, "red");
      // Log the page content for debugging
      try {
        const pageContent = await page.content();
        log("Page content at time of error (first 1000 chars):", "red");
        log(pageContent.substring(0, 1000), "red");
      } catch (contentError) {
        log(`Could not retrieve page content: ${contentError.message}`, "red");
      }
      throw retryError;
    }
  }

  // Password
  log("Generating password...", "green");
  const password = await generatePassword();
  log(`Generated password: ${password}`, "yellow");
  log("Waiting for password input field...", "yellow");
  
  // Try the primary selector first
  let passwordFieldFound = false;
  try {
    await page.waitForSelector(SELECTORS.PASSWORD_INPUT, { timeout: 15000 });
    log("Primary password input found, filling...", "green");
    await page.type(SELECTORS.PASSWORD_INPUT, password);
    passwordFieldFound = true;
  } catch (error) {
    log(`Primary selector failed: ${error.message}`, "yellow");
  }
  
  // If primary failed, try alternatives
  if (!passwordFieldFound) {
    const alternativeSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id="i0118"]',
      '#i0118'
    ];
    
    for (const selector of alternativeSelectors) {
      try {
        log(`Trying alternative selector: ${selector}`, "yellow");
        await page.waitForSelector(selector, { timeout: 5000 });
        log(`Alternative selector ${selector} found, filling...`, "green");
        await page.type(selector, password);
        passwordFieldFound = true;
        break; // Success, exit the loop
      } catch (altError) {
        log(`Alternative selector ${selector} failed: ${altError.message}`, "yellow");
      }
    }
  }
  
  if (passwordFieldFound) {
    log("Password field filled successfully", "green");
    await page.keyboard.press("Enter");
    log("Pressed Enter after password", "green");
  } else {
    log("WARNING: Could not find password field after all attempts", "red");
    throw new Error("Password field not found after all selector attempts");
  }

  // Country/Region selection
  log("Selecting country/region...", "green");
  try {
    await page.waitForSelector('#countryDropdownId', { timeout: 10000 });
    await page.click('#countryDropdownId');
    log("Country dropdown clicked", "green");
    await page.keyboard.press("Enter");
    log("Pressed Enter to select country", "green");
  } catch (error) {
    log("Country dropdown not found or selectable, continuing...", "yellow");
  }

  // Day selection
  log("Selecting day...", "green");
  try {
    await page.waitForSelector('#BirthDayDropdown', { timeout: 10000 });
    await page.click('#BirthDayDropdown');
    log("Day dropdown clicked", "green");
    await page.keyboard.press("Enter");
    log("Pressed Enter to select day", "green");
  } catch (error) {
    log("Day dropdown not found or selectable, continuing...", "yellow");
  }

  // Month selection
  log("Selecting month...", "green");
  try {
    await page.waitForSelector('#BirthMonthDropdown', { timeout: 10000 });
    await page.click('#BirthMonthDropdown');
    log("Month dropdown clicked", "green");
    await page.keyboard.press("Enter");
    log("Pressed Enter to select month", "green");
  } catch (error) {
    log("Month dropdown not found or selectable, continuing...", "yellow");
  }

  // Year input (direct entry)
  log("Entering year...", "green");
  try {
    await page.waitForSelector('#floatingLabelInput24', { timeout: 5000 });
    await page.type('#floatingLabelInput24', PersonalInfo.birthYear);
    log("Year " + PersonalInfo.birthYear + " entered into floatingLabelInput24", "green");
    await page.keyboard.press("Enter");
    log("Pressed Enter after year input", "green");
  } catch (error) {
    log("Year input failed: " + error.message, "red");
    log("Trying alternative approach...", "yellow");
    // Fallback to existing birth year input if the specific field doesn't exist
    try {
      await page.waitForSelector('input[name="BirthYear"]', { timeout: 5000 });
      await page.type('input[name="BirthYear"]', PersonalInfo.birthYear);
      log("Year " + PersonalInfo.birthYear + " entered via fallback method", "green");
      await page.keyboard.press("Enter");
      log("Pressed Enter after fallback year input", "green");
    } catch (fallbackError) {
      log("Fallback also failed: " + fallbackError.message, "red");
      log("Continuing with existing workflow...", "yellow");
    }
  }

  // First Name and Last Name
  await page.waitForSelector(SELECTORS.FIRST_NAME_INPUT);
  await page.type(SELECTORS.FIRST_NAME_INPUT, PersonalInfo.randomFirstName);
  await page.type(SELECTORS.LAST_NAME_INPUT, PersonalInfo.randomLastName);
  await page.keyboard.press("Enter");

  // Birth Date.
  await page.waitForSelector(SELECTORS.BIRTH_DAY_INPUT);
  await delay(1000);
  await page.select(SELECTORS.BIRTH_DAY_INPUT, PersonalInfo.birthDay);
  await page.select(SELECTORS.BIRTH_MONTH_INPUT, PersonalInfo.birthMonth);
  await page.type(SELECTORS.BIRTH_YEAR_INPUT, PersonalInfo.birthYear);
  await page.keyboard.press("Enter");
  const email = await page.$eval(SELECTORS.EMAIL_DISPLAY, el => el.textContent);
  try {
    await page.waitForSelector(SELECTORS.FUNCAPTCHA, { timeout: 60000 });
    log("Please solve the captcha", "yellow");
    log("Instructions: Hold down the CAPTCHA button until it completes", "yellow");
    log("Look for element with class 'px-inner-loading-area' for the specific CAPTCHA", "yellow");
    
    // Enhanced CAPTCHA waiting with multiple approaches
    const captchaTimeout = 60000;
    const startTime = Date.now();
    
    // Try to wait for CAPTCHA to be solved with multiple checks
    while (Date.now() - startTime < captchaTimeout) {
      try {
        // Check if CAPTCHA element is still present (not solved)
        const captchaPresent = await page.evaluate((selector) => {
          return !!document.querySelector(selector);
        }, SELECTORS.FUNCAPTCHA);
        
        if (!captchaPresent) {
          log("CAPTCHA appears to be solved", "green");
          break;
        }
        
        // Small delay before next check
        await delay(1000);
      } catch (checkError) {
        // If evaluation fails, assume CAPTCHA is solved
        log("CAPTCHA evaluation complete", "green");
        break;
      }
    }
    
    log("CAPTCHA waiting period completed", "green");
  } catch (captchaError) {
    log("CAPTCHA detection timeout or error: " + captchaError.message, "yellow");
    log("Continuing with process - CAPTCHA may have been bypassed", "yellow");
  }

  // Waiting for confirmed account.
  try {
    await page.waitForSelector(SELECTORS.DECLINE_BUTTON, { timeout: 10000 });
    await page.click(SELECTORS.DECLINE_BUTTON);
  } catch (error) {
    log("DECLINE_BUTTON not found within 10 seconds, checking for POST_REDIRECT_FORM...", "yellow");
    const postRedirectFormExists = await page.$(SELECTORS.POST_REDIRECT_FORM);
    if (postRedirectFormExists) {
      log("POST_REDIRECT_FORM found, checking for CLOSE_BUTTON...", "green");
      await page.waitForSelector(SELECTORS.CLOSE_BUTTON);
      log("CLOSE_BUTTON found, clicking...", "green");
      await page.click(SELECTORS.CLOSE_BUTTON);
    } else {
      log("Neither DECLINE_BUTTON nor POST_REDIRECT_FORM found.", "red");
    }
  }
  await page.waitForSelector(SELECTORS.OUTLOOK_PAGE);

  if (config.ADD_RECOVERY_EMAIL) {
    log("Adding Recovery Email...", "yellow");
    await page.goto("https://account.live.com/proofs/Manage");

    // First verify.
    await page.waitForSelector(SELECTORS.RECOVERY_EMAIL_INPUT);
    const recoveryEmail = await recMail.getEmail();
    await page.type(SELECTORS.RECOVERY_EMAIL_INPUT, recoveryEmail.email);
    await page.keyboard.press("Enter");
    await page.waitForSelector(SELECTORS.EMAIL_CODE_INPUT);
    log("Waiting for Email Code... (first verify)", "yellow");
    firstCode = await recMail.getMessage(recoveryEmail);
    log(`Email Code Received! Code: ${firstCode}`, "green");
    await page.type(SELECTORS.EMAIL_CODE_INPUT, firstCode);
    await page.keyboard.press("Enter");
    await delay(5000);
    if (await page.$(SELECTORS.VERIFICATION_ERROR)) {
      log("Verification Error, resending code...", "red");
      await resendCode(page, recoveryEmail);
    }

    try {
      await page.waitForSelector(SELECTORS.INTERRUPT_CONTAINER, { timeout: 10000 });
    } catch (error) {
      log("INTERRUPT_CONTAINER not found within 10 seconds, checking for AFTER_CODE...", "yellow");
      const afterCodeExists = await page.$(SELECTORS.AFTER_CODE);
      if (afterCodeExists) {
        log("Second Verify Needed", "yellow");
        // Second verify.
        await page.click(SELECTORS.AFTER_CODE);
        await page.waitForSelector(SELECTORS.DOUBLE_VERIFY_EMAIL);
        await page.type(SELECTORS.DOUBLE_VERIFY_EMAIL, recoveryEmail.email);
        await page.keyboard.press("Enter");
        await page.waitForSelector(SELECTORS.DOUBLE_VERIFY_CODE);
        log("Waiting for Email Code... (second verify)", "yellow");
        secondCode = await recMail.getMessage(recoveryEmail);
        log(`Email Code Received! Code: ${secondCode}`, "green");
        await page.type(SELECTORS.DOUBLE_VERIFY_CODE, secondCode);
        await page.keyboard.press("Enter");
        await delay(5000);
        if (await page.$(SELECTORS.VERIFICATION_ERROR)) {
          log("Verification Error, resending code...", "red");
          await resendCode(page, recoveryEmail);
        }
        await page.waitForSelector(SELECTORS.INTERRUPT_CONTAINER);
      } else {
        log("Neither INTERRUPT_CONTAINER nor AFTER_CODE found.", "red");
      }
    }
  }

  await writeCredentials(email, password);

}

async function resendCode(page, recoveryEmail) {
  try {
    await page.click(SELECTORS.RESEND_CODE);
    await page.waitForSelector(SELECTORS.EMAIL_CODE_INPUT);
    log("Waiting for Email Code...", "yellow");
    const code = await recMail.getMessage(recoveryEmail);
    log(`Email Code Received! Code: ${code}`, "green");
    await page.type(SELECTORS.EMAIL_CODE_INPUT, code);
    await page.keyboard.press("Enter");
  } catch (error) {
    log("Failed to resend code: " + error.message, "red");
    throw error;
  }
}

async function writeCredentials(email, password) {
  // Writes account's credentials on "accounts.txt".
  const account = email + ":" + password;
  log(account, "green");
  fs.appendFile(config.ACCOUNTS_FILE, `\n${account}`, (err) => {
    if (err) {
      log(err, "red");
    }
  });
}

async function generatePersonalInfo() {
  const names = fs.readFileSync(config.NAMES_FILE, "utf8").split("\n");
  const randomFirstName = names[Math.floor(Math.random() * names.length)].trim();
  const randomLastName = names[Math.floor(Math.random() * names.length)].trim();
  const username = randomFirstName + randomLastName + Math.floor(Math.random() * 9999);
  const email = username + "@outlook.com";
  const birthDay = (Math.floor(Math.random() * 28) + 1).toString()
  const birthMonth = (Math.floor(Math.random() * 12) + 1).toString()
  const birthYear = (Math.floor(Math.random() * 10) + 1990).toString()
  return { username, email, randomFirstName, randomLastName, birthDay, birthMonth, birthYear };
}

async function generatePassword() {
  const words = fs.readFileSync(config.WORDS_FILE, "utf8").split("\n");
  const firstword = words[Math.floor(Math.random() * words.length)].trim();
  const secondword = words[Math.floor(Math.random() * words.length)].trim();
  return firstword + secondword + Math.floor(Math.random() * 9999) + '!';
}

const SELECTORS = {
  USERNAME_INPUT: 'input[type="email"], input[name="username"], input[id="i0116"]',
  PASSWORD_INPUT: 'input[type="password"], input[name="password"], input[id="i0118"]',
  FIRST_NAME_INPUT: '#firstNameInput',
  LAST_NAME_INPUT: '#lastNameInput',
  BIRTH_DAY_INPUT: '#BirthDay',
  BIRTH_MONTH_INPUT: '#BirthMonth',
  BIRTH_YEAR_INPUT: '#BirthYear',
  EMAIL_DISPLAY: '#userDisplayName',
  DECLINE_BUTTON: '#declineButton',
  OUTLOOK_PAGE: '#mainApp',
  RECOVERY_EMAIL_INPUT: '#EmailAddress',
  EMAIL_CODE_INPUT: '#iOttText',
  AFTER_CODE: '#idDiv_SAOTCS_Proofs_Section',
  DOUBLE_VERIFY_EMAIL: '#idTxtBx_SAOTCS_ProofConfirmation',
  DOUBLE_VERIFY_CODE: '#idTxtBx_SAOTCC_OTC',
  INTERRUPT_CONTAINER: '#interruptContainer',
  VERIFICATION_ERROR: '#iVerificationErr',
  RESEND_CODE: '#iShowSendCode',
  POST_REDIRECT_FORM: 'form[data-testid="post-redirect-form"]',
  CLOSE_BUTTON: '#close-button',
  FUNCAPTCHA: '#enforcementFrame',
};

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

start();