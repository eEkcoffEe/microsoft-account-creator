const { plugin } = require('puppeteer-with-fingerprints');
const fs = require("fs");
const config = require('./config');
const log = require('./Utils/log');
const recMail = require('./Utils/recMail');
const axios = require('axios');

async function start() {
  console.clear();

  log("Starting...", "green");

  // Skip fingerprint fetching to speed up the process
  // This is a performance optimization as requested
  log("Skipping fingerprint fetching to speed up process...", "yellow");
  let fingerprint = null;

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
  
  // Implement enhanced retry mechanism for year input with better error handling
  let yearInputSuccess = false;
  let retryCount = 0;
  const maxRetries = 5;
  
  while (!yearInputSuccess && retryCount < maxRetries) {
    try {
      log(`Attempt ${retryCount + 1} to enter year`, "yellow");
      
      // First, wait for any year-related input field to appear
      let yearInputSelector = '';
      let yearInputFound = false;
      
      // Try multiple selectors for year input fields
      const yearSelectors = [
        '#floatingLabelInput24',
        'input[name="BirthYear"]',
        '#BirthYear',
        '[data-testid="birth-year-input"]',
        'input[type="number"][name*="year"]'
      ];
      
      for (const selector of yearSelectors) {
        try {
          log(`Trying selector for year input: ${selector}`, "yellow");
          await page.waitForSelector(selector, { timeout: 5000 });
          yearInputSelector = selector;
          yearInputFound = true;
          log(`Found year input field with selector: ${selector}`, "green");
          break;
        } catch (selectorError) {
          log(`Selector ${selector} not found: ${selectorError.message}`, "yellow");
          continue;
        }
      }
      
      if (!yearInputFound) {
        throw new Error("No year input field found with any of the known selectors");
      }
      
      // Clear the field first to ensure clean input
      await page.focus(yearInputSelector);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      
      // Type the year with a small delay between keystrokes to simulate human typing
      for (let char of PersonalInfo.birthYear) {
        await page.keyboard.type(char);
        await delay(50); // Small delay between keystrokes
      }
      
      log("Year " + PersonalInfo.birthYear + " entered into " + yearInputSelector, "green");
      
      // Wait a bit for the input to be processed
      await delay(1000);
      
      // Press enter
      await page.keyboard.press("Enter");
      log("Pressed Enter after year input", "green");
      
      // Wait for page to process the input and potentially redirect to CAPTCHA
      await delay(3000);
      
      // Check if we moved to the next step or CAPTCHA appeared
      try {
        // Check if we're on the name/last name input page (next step)
        await page.waitForSelector(SELECTORS.FIRST_NAME_INPUT, { timeout: 3000 });
        log("Successfully moved to next step after year input", "green");
        yearInputSuccess = true;
      } catch (nextStepError) {
        // Check if CAPTCHA appeared
        try {
          await page.waitForSelector(SELECTORS.FUNCAPTCHA, { timeout: 3000 });
          log("CAPTCHA detected after year input", "green");
          yearInputSuccess = true;
        } catch (captchaError) {
          log("No next step or CAPTCHA detected, retrying...", "yellow");
          retryCount++;
          await delay(2000);
        }
      }
      
    } catch (error) {
      log("Year input failed on attempt " + (retryCount + 1) + ": " + error.message, "red");
      retryCount++;
      if (retryCount < maxRetries) {
        log("Retrying year input...", "yellow");
        await delay(2000);
      } else {
        log("Max retries reached for year input", "red");
      }
    }
  }
  
  // If we still haven't succeeded, try alternative approach
  if (!yearInputSuccess) {
    log("Trying alternative approach for year input...", "yellow");
    try {
      // Wait for the alternative year input field to be available
      await page.waitForSelector('input[name="BirthYear"]', { timeout: 10000 });
      
      // Clear the field first to ensure clean input
      await page.focus('input[name="BirthYear"]');
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      
      // Type the year with a small delay between keystrokes to simulate human typing
      for (let char of PersonalInfo.birthYear) {
        await page.keyboard.type(char);
        await delay(50); // Small delay between keystrokes
      }
      
      log("Year " + PersonalInfo.birthYear + " entered via fallback method", "green");
      
      // Wait a bit for the input to be processed
      await delay(1000);
      
      // Press enter
      await page.keyboard.press("Enter");
      log("Pressed Enter after fallback year input", "green");
      
      // Wait for page to process the input and potentially redirect to CAPTCHA
      await delay(3000);
      
      yearInputSuccess = true;
    } catch (fallbackError) {
      log("Fallback also failed: " + fallbackError.message, "red");
    }
  }
  
  if (!yearInputSuccess) {
    log("WARNING: Year input failed after all attempts", "red");
    // Instead of throwing an error, let's try to continue and handle CAPTCHA
    log("Continuing with process despite year input failure...", "yellow");
  }


  // First Name and Last Name
  await page.waitForSelector(SELECTORS.FIRST_NAME_INPUT);
  await page.type(SELECTORS.FIRST_NAME_INPUT, PersonalInfo.randomFirstName);
  await page.type(SELECTORS.LAST_NAME_INPUT, PersonalInfo.randomLastName);
  
  // Add a small delay before pressing Enter to ensure all inputs are processed
  await delay(500);
  await page.keyboard.press("Enter");
  
  // Wait for page to process the input and potentially redirect to CAPTCHA
  await delay(3000);
  
  // Check if we moved to the next step or CAPTCHA appeared
  try {
    // Check if we're on the birth date input page
    await page.waitForSelector(SELECTORS.BIRTH_DAY_INPUT, { timeout: 3000 });
    log("Successfully moved to birth date input page", "green");
  } catch (error) {
    // Check if CAPTCHA appeared
    try {
      await page.waitForSelector(SELECTORS.FUNCAPTCHA, { timeout: 3000 });
      log("CAPTCHA detected during name input", "green");
    } catch (captchaError) {
      log("No CAPTCHA or next step detected after name input, trying to press Enter...", "yellow");
      // Instead of trying to click the button, simply press Enter key
      // This should submit the form or proceed with the verification
      try {
        log("Pressing Enter to proceed with verification...", "green");
        await page.keyboard.press("Enter");
        log("Pressed Enter successfully", "green");
        // Add a second press of Enter after 15 seconds
        log("Waiting 15 seconds before second Enter press...", "yellow");
        await delay(15000);
        log("Pressing Enter second time...", "green");
        await page.keyboard.press("Enter");
        log("Pressed Enter second time successfully", "green");
      } catch (enterError) {
        log("Failed to press Enter: " + enterError.message, "red");
        // Fallback to clicking center of page as last resort
        log("Falling back to center click...", "yellow");
        await delay(500);
        await page.mouse.click(250, 300); // Click near center of page
        log("Clicked center of page as fallback", "green");
      }
    }
  }

  // Birth Date.
  await page.waitForSelector(SELECTORS.BIRTH_DAY_INPUT);
  await delay(1000);
  await page.select(SELECTORS.BIRTH_DAY_INPUT, PersonalInfo.birthDay);
  await page.select(SELECTORS.BIRTH_MONTH_INPUT, PersonalInfo.birthMonth);
  
  // Improved birth year input with retry mechanism and CAPTCHA monitoring
  let birthYearInputSuccess = false;
  let birthYearRetryCount = 0;
  const maxBirthYearRetries = 3;
  
  while (!birthYearInputSuccess && birthYearRetryCount < maxBirthYearRetries) {
    try {
      log(`Attempt ${birthYearRetryCount + 1} to enter birth year in birth date section`, "yellow");
      
      // Clear the field first to ensure clean input
      await page.focus(SELECTORS.BIRTH_YEAR_INPUT);
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      
      // Type the year with a small delay between keystrokes to simulate human typing
      for (let char of PersonalInfo.birthYear) {
        await page.keyboard.type(char);
        await delay(50); // Small delay between keystrokes
      }
      
      log("Birth year " + PersonalInfo.birthYear + " entered into birth date section", "green");
      
      // Wait a bit for the input to be processed
      await delay(1000);
      
      // Press enter
      await page.keyboard.press("Enter");
      log("Pressed Enter after birth year input", "green");
      
      // Wait for page to process the input
      await delay(3000);
      
      // Check if we moved to the next step or CAPTCHA appeared
      try {
        // Check if we're on the next step (recovery email or confirmation)
        await page.waitForSelector(SELECTORS.EMAIL_DISPLAY, { timeout: 3000 });
        log("Successfully moved to next step after birth year input", "green");
        birthYearInputSuccess = true;
      } catch (nextStepError) {
        // Check if CAPTCHA appeared
        try {
          await page.waitForSelector(SELECTORS.FUNCAPTCHA, { timeout: 3000 });
          log("CAPTCHA detected after birth year input", "green");
          birthYearInputSuccess = true;
        } catch (captchaError) {
          log("No next step or CAPTCHA detected, retrying...", "yellow");
          birthYearRetryCount++;
          await delay(2000);
        }
      }
      
    } catch (error) {
      log("Birth year input failed on attempt " + (birthYearRetryCount + 1) + ": " + error.message, "red");
      birthYearRetryCount++;
      if (birthYearRetryCount < maxBirthYearRetries) {
        log("Retrying birth year input...", "yellow");
        await delay(2000);
      } else {
        log("Max retries reached for birth year input", "red");
      }
    }
  }
  
  // Even if input failed, check if we've moved to the next step anyway
  if (!birthYearInputSuccess) {
    try {
      await page.waitForSelector(SELECTORS.EMAIL_DISPLAY, { timeout: 2000 });
      log("Moved to next step despite birth year input issues", "green");
      birthYearInputSuccess = true;
    } catch (error) {
      log("Still couldn't move to next step after birth year input", "yellow");
    }
  }
  
  const email = await page.$eval(SELECTORS.EMAIL_DISPLAY, el => el.textContent);
  
  // Wait a moment for page to update after year input
  await delay(1000);
  log("Waiting after year input to allow page to stabilize...", "yellow");
  
  // Enhanced CAPTCHA detection with adaptive waiting and better fallbacks
  log("Checking for CAPTCHA after year input...", "yellow");
  let captchaDetected = false;
  let captchaCheckAttempts = 0;
  const maxCaptchaCheckAttempts = 5;
  
  while (!captchaDetected && captchaCheckAttempts < maxCaptchaCheckAttempts) {
    try {
      captchaCheckAttempts++;
      log(`CAPTCHA check attempt ${captchaCheckAttempts}...`, "yellow");
      
      // Wait up to 25 seconds for CAPTCHA to appear after year input
      const captchaElement = await page.waitForSelector(SELECTORS.FUNCAPTCHA, { timeout: 25000 });
      if (captchaElement) {
        captchaDetected = true;
        log("CAPTCHA element detected!", "green");
      } else {
        log("CAPTCHA element NOT found after year input", "yellow");
      }
    } catch (checkError) {
      log(`CAPTCHA check attempt ${captchaCheckAttempts} failed: ` + checkError.message, "yellow");
      if (captchaCheckAttempts < maxCaptchaCheckAttempts) {
        await delay(3000); // Wait before retrying
      }
    }
  }
  
  // If CAPTCHA wasn't detected immediately, wait a bit longer and check again
  if (!captchaDetected) {
    log("Waiting a bit more to see if CAPTCHA appears...", "yellow");
    await delay(8000);
    try {
      const captchaElement = await page.$(SELECTORS.FUNCAPTCHA);
      if (captchaElement) {
        captchaDetected = true;
        log("CAPTCHA element detected after additional wait!", "green");
      } else {
        log("CAPTCHA element still not found after additional wait", "yellow");
      }
    } catch (checkError) {
      log("Error checking CAPTCHA after additional wait: " + checkError.message, "yellow");
    }
  }
  
  // If CAPTCHA still not detected, try alternative detection methods
  if (!captchaDetected) {
    log("Trying alternative CAPTCHA detection methods...", "yellow");
    try {
      // Try checking for common CAPTCHA related elements
      const captchaSelectors = [
        '#captcha-container',
        '.captcha-wrapper',
        '[data-testid="captcha"]',
        '.g-recaptcha',
        '#recaptcha-anchor',
        '.cf-turnstile',
        '[class*="turnstile"]',
        '.hcaptcha',
        '[data-sitekey]'
      ];
      
      for (const selector of captchaSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 3000 });
          log(`Alternative CAPTCHA element detected with selector: ${selector}`, "green");
          captchaDetected = true;
          break;
        } catch (altError) {
          continue;
        }
      }
    } catch (altDetectionError) {
      log("Alternative CAPTCHA detection failed: " + altDetectionError.message, "yellow");
    }
  }
  
  // Final fallback - if we still haven't detected CAPTCHA but have moved to a new page,
  // check if we're on a page that might require CAPTCHA later
  if (!captchaDetected) {
    log("Final check: verifying if we're on a page that might require CAPTCHA", "yellow");
    try {
      // Check for common indicators that CAPTCHA might appear later
      const indicators = [
        '#consent',
        '.consent-banner',
        '[data-testid="consent"]',
        '.cookie-banner'
      ];
      
      for (const indicator of indicators) {
        try {
          await page.waitForSelector(indicator, { timeout: 2000 });
          log(`Found potential consent/cookie indicator: ${indicator}`, "yellow");
          // This might mean CAPTCHA is coming later
        } catch (indicatorError) {
          continue;
        }
      }
    } catch (finalCheckError) {
      log("Final check failed: " + finalCheckError.message, "yellow");
    }
  }
  
  // Debug: Log before CAPTCHA processing
  log("About to start CAPTCHA processing...", "yellow");
  
  // Debug: Check if iframe exists before trying to access it
  log("Checking for enforcementFrame before processing...", "yellow");
  try {
    const frameElement = await page.$('#enforcementFrame');
    if (frameElement) {
      log("enforcementFrame element found", "green");
    } else {
      log("enforcementFrame element NOT found", "red");
    }
  } catch (frameCheckError) {
    log("Error checking enforcementFrame: " + frameCheckError.message, "red");
  }
  
  // Simplified and robust CAPTCHA solving approach
  if (captchaDetected) {
    log("CAPTCHA detected, attempting simplified automatic solving...", "green");
    
    // Simple approach: Try to click common CAPTCHA buttons directly
    try {
      // Wait a bit more to ensure CAPTCHA is fully loaded
      await delay(2000);
      
      // Try to find and click CAPTCHA buttons in a simple way
      const buttonSelectors = [
        'a[role="button"]',
        'div[role="button"]',
        'button',
        '[class*="captcha"]',
        '[class*="button"]'
      ];
      
      let buttonClicked = false;
      let attempt = 0;
      const maxAttempts = 5;
      
      while (!buttonClicked && attempt < maxAttempts) {
        attempt++;
        log(`Attempt ${attempt} to click CAPTCHA button...`, "yellow");
        
        for (const selector of buttonSelectors) {
          try {
            // Try to find and click the button
            const button = await page.waitForSelector(selector, { timeout: 3000 });
            if (button) {
              log(`Found CAPTCHA button with selector: ${selector}`, "green");
              const box = await button.boundingBox();
              log("Button bounding box: x=" + box.x + ", y=" + box.y + ", width=" + box.width + ", height=" + box.height, "yellow");
              
              // Click the button with some human-like behavior
              await page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 5 });
              await delay(100);
              await page.mouse.down();
              await delay(1000); // Hold for 1 second
              await page.mouse.up();
              log("CAPTCHA button clicked successfully", "green");
              buttonClicked = true;
              break;
            }
          } catch (selectorError) {
            log(`Selector ${selector} not found: ${selectorError.message}`, "yellow");
            continue;
          }
        }
        
        if (!buttonClicked) {
          log("No CAPTCHA button found on this attempt, waiting before retry...", "yellow");
          await delay(2000);
        }
      }
      
      if (buttonClicked) {
        log("CAPTCHA button clicked successfully, continuing...", "green");
      } else {
        log("Could not click CAPTCHA button after all attempts", "red");
        log("Continuing with manual CAPTCHA solving...", "yellow");
      }
    } catch (error) {
      log("Error in simplified CAPTCHA solving: " + error.message, "red");
      log("Continuing with manual CAPTCHA solving...", "yellow");
    }
  } else {
    // If CAPTCHA was not detected, wait a bit more to see if page transitions
    log("CAPTCHA not detected, checking if page transitioned to next step...", "yellow");
    await delay(5000);
    
    // Try to detect if we've moved to the next step of registration
    try {
      // Check if we're on the name/last name input page
      const nameInput = await page.$('#firstNameInput');
      if (nameInput) {
        log("Page seems to have progressed to name input stage", "green");
      } else {
        log("Still waiting for page to advance or CAPTCHA to appear", "yellow");
      }
    } catch (error) {
      log("Error checking page progression: " + error.message, "red");
    }
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