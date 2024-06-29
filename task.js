const os = require('os');
const fs = require('fs');
const { clickButton } = require('./clickButton');
const TEST_SCRIPT = './test.js';
const { sleep } = require('./sleep');

async function executeTestScriptInConsole(page, scriptPath) {
    // Open the console
    if (os.platform() === 'darwin') { // macOS
        await page.keyboard.down('Meta');
        await page.keyboard.press('Option');
        await page.keyboard.press('J');
        await page.keyboard.up('Meta');
        await page.keyboard.up('Option');
    } else if (os.platform() === 'win32') { // Windows
        await page.keyboard.down('Control');
        await page.keyboard.press('Shift');
        await page.keyboard.press('J');
        await page.keyboard.up('Control');
        await page.keyboard.up('Shift');
    }
    console.log("Console opened");

    // Wait for the console to open
    await sleep(2000);

    // Clear the console
    await page.evaluate(() => {
        console.clear();
    });
    console.log("Console cleared");


    console.log("\n3. EXECUTE SCRIPT\n");

    // Read the test script
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    console.log("Script loaded");

    // Execute the script in the console
    await page.evaluate(scriptContent);
    console.log("Script executed");
}

async function injectScript(page, currentKeyWord) {
    try {
        await page.goto('https://www.linkedin.com/');

        try {
            await page.waitForSelector('aside[id="msg-overlay"]', { timeout: 60000 });
        } catch (e) {
            console.error("No message overlay box found");
        }
        await sleep(2000);

        await page.evaluate(() => {
            const msgOverlay = document.getElementById('msg-overlay');
            console.log(msgOverlay);
            if (msgOverlay) {
                msgOverlay.style.display = 'none';
            }
        });

        await page.waitForSelector('button[aria-label="Click to start a search"]', { timeout: 5000 });
        try {
            await page.click('button[aria-label="Click to start a search"]');
        } catch(e) {
            console.error("No search button found");
        }
        await page.type('input[aria-label="Search"]', currentKeyWord.keyword, { delay: 200 });
        await page.keyboard.press('Enter');
        await sleep(10000);

        try {
            await page.waitForSelector('button[aria-label*="Show all filters"]', { timeout: 5000});
        } catch(e) {
            console.error("There is no 'show all filters button'");
        }

        await clickButton(page, ['Posts']);

        // OPEN AND CLEAR CONSOLE
        console.log("\n3. OPEN AND CLEAR CONSOLE\n");
        await executeTestScriptInConsole(page, TEST_SCRIPT);
    } catch(e) {
        console.error("Error executing injection:", e);
    }
}

async function checkViews(page) {
    // pass
}

module.exports = { injectScript, checkViews };