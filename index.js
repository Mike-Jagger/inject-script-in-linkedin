const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const schedule = require('node-schedule');
const { sleep } = require('./sleep');
const { clickButton } = require('./clickButton');
const { ResourceManager } = require('./ResourceManager');

const COOKIES_PATH = './auth/testCookies.json';
const SETTINGS_PATH = './testSettings.json';
const LOCAL_STORAGE_PATH = './auth/testLocalStorage.json';
const TXT_KEYWORDS = './keywords.txt';
const JSON_KEYWORDS = './testKeywords.json';
const TEST_SCRIPT = './test.js';
const historyPath = './testHistory.json';
const LOGIN_PAGE = 'https://www.linkedin.com/login';
const LOCK_FILE = './lockfile';

// Load settings from JSON file
let settings = {
    shouldBrowseInHeadless: false,
    numberOfPagesOpened: 4,
    amountOfHoursRun: 4,
    numberOfTimesProgramShouldRun: -1
};

function loadSettings() {
    if (fs.existsSync(SETTINGS_PATH)) {
        const settingsData = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
        settings = settingsData.Settings;
        if (settings.numberOfTimesProgramShouldRun === -1) settings.numberOfTimesProgramShouldRun = Infinity;
    }
}

async function recordHistory(keyword) {
    const currentTime = new Date().toLocaleString();
    let history = { history: [] };

    if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }

    history.history.push({ time: currentTime, keyword: keyword });

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

async function setupSettings() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (question) => {
        return new Promise((resolve) => rl.question(question, resolve));
    };
    await sleep(2000);
    console.log('WARNING: You will only be prompted to set the settings once!');
    await sleep(3000);
    console.log('BUT you can change them in the settings.json file\n');
    await sleep(3000)
    settings.shouldBrowseInHeadless = (await askQuestion('Do you want to browse in headless mode? (Y/N): ')).toLowerCase() === 'y';
    settings.numberOfPagesOpened = parseInt(await askQuestion('How many browser windows do you want to open? (default: 4): ')) || 4;
    settings.amountOfHoursRun = parseInt(await askQuestion('How many hours should the program run? (default: 4): ')) || 4;
    settings.numberOfTimesProgramShouldRun = parseInt(await askQuestion('How many times do you want the program to run for? (default: -1 [to run until forced stop])')) || -1;

    rl.close();

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ Settings: settings }, null, 2));
}

async function loadCookiesAndLocalStorage(page) {
    if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
        for (const cookie of cookies) {
            await page.setCookie(cookie);
        }
    }
    if (fs.existsSync(LOCAL_STORAGE_PATH)) {
        const localStorageData = JSON.parse(fs.readFileSync(LOCAL_STORAGE_PATH, 'utf-8'));
        await page.evaluate(data => {
            for (const [key, value] of Object.entries(data)) {
                localStorage.setItem(key, value);
            }
        }, localStorageData);
    }
}

async function saveCookiesAndLocalStorage(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));

    const localStorageData = await page.evaluate(() => {
        let data = {};
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    });
    fs.writeFileSync(LOCAL_STORAGE_PATH, JSON.stringify(localStorageData, null, 2));
}

async function login() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (question) => {
        return new Promise((resolve) => rl.question(question, resolve));
    };

    const username = await askQuestion('Enter your LinkedIn username (email): ');
    const password = await askQuestion('Enter your LinkedIn password: ');
    rl.close();

    const browser = await puppeteer.launch({ headless: settings.shouldBrowseInHeadless });

    const page = await browser.newPage();

    await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle2' });
    await page.type('#username', username);
    await page.type('#password', password);
    await page.click('button[type="submit"]');

    try{
        await page.waitForSelector('button[id="two-step-submit-button"]', { timeout: 5000 });
        console.log("Waiting for 2FA");
        await page.waitForSelector('button[aria-label="Click to start a search"]', { timeout: 1800000 });
    } catch (e) {
        console.error("No two factor auth");
    }

    return {
        newPage: page,
        newBrowser: browser
    };
}

async function isLoginSuccessful(page) {
    try {
        await page.waitForSelector('button[aria-label="Click to start a search"]', { timeout: 5000 });
        return true;
    } catch (error) {
        return false;
    }
}

// Function to acquire a lock
async function acquireLock() {
    while (fs.existsSync(LOCK_FILE)) {
        await sleep(100);
    }
    fs.writeFileSync(LOCK_FILE, 'lock');
}

// Function to release a lock
function releaseLock() {
    if (fs.existsSync(LOCK_FILE)) {
        fs.unlinkSync(LOCK_FILE);
    }
}

// Function to update the JSON_KEYWORDS file based on the TXT_KEYWORDS file
async function updateKeywordsFromFile() {
    const txtKeywordsPath = path.resolve(__dirname, TXT_KEYWORDS);
    const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);

    let txtKeywords = [];
    let jsonKeywords = { currentKeyWord: {}, keyWords: [] };

    if (fs.existsSync(txtKeywordsPath)) {
        const txtData = fs.readFileSync(txtKeywordsPath, 'utf-8');
        txtKeywords = txtData.split('\n').map(keyword => keyword.trim()).filter(keyword => keyword.length > 0);
    }

    if (fs.existsSync(jsonKeywordsPath)) {
        jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
    }

    const existingKeywords = jsonKeywords.keyWords.map(item => item.keyword);
    let updated = false;

    txtKeywords.forEach((keyword, index) => {
        if (!existingKeywords.includes(keyword)) {
            jsonKeywords.keyWords.push({ index: jsonKeywords.keyWords.length, keyword: keyword });
            updated = true;
        }
    });

    if (updated) {
        fs.writeFileSync(jsonKeywordsPath, JSON.stringify(jsonKeywords, null, 2));
        console.log('Keywords updated in JSON file.');
    } else {
        console.log('No new keywords to update.');
    }
}

// Function to move to the next keyword and update the currentKeyWord
async function moveToNextKeyword() {
    const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);

    if (fs.existsSync(jsonKeywordsPath)) {
        const jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
        const currentIndex = jsonKeywords.currentKeyWord.index ?? -1;
        if (jsonKeywords.keyWords.length > 0) {
            const nextIndex = (currentIndex + 1) % jsonKeywords.keyWords.length;
            jsonKeywords.currentKeyWord = jsonKeywords.keyWords[nextIndex];
            fs.writeFileSync(jsonKeywordsPath, JSON.stringify(jsonKeywords, null, 2));
            console.log('Current keyword updated to:', jsonKeywords.currentKeyWord.keyword);
        } else {
            console.log('No keywords available to update.');
        }
    } else {
        console.log('Keywords JSON file not found.');
    }
}

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

// Define your ResourceManager instances
let resourceManagers = [];

async function performAutomationTask(browserIndex, quadrant) {
    await acquireLock();
    try {
        await updateKeywordsFromFile();
        await moveToNextKeyword();
    } finally {
        releaseLock();
    }

    // Load the current keyword
    const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);
    let currentKeyWord = {};
    if (fs.existsSync(jsonKeywordsPath)) {
        const jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
        currentKeyWord = jsonKeywords.currentKeyWord;
    }

    // Record the history of the run
    await recordHistory(currentKeyWord.keyword);

    // Initialize ResourceManager if not already initialized
    if (!resourceManagers[browserIndex]) {
        resourceManagers[browserIndex] = await new ResourceManager(settings, quadrant);
        await resourceManagers[browserIndex].init();

        const resourceManager = resourceManagers[browserIndex];
        const page = await resourceManager.createPage();

        await page.goto(LOGIN_PAGE);

        await loadCookiesAndLocalStorage(page);

        let isPageError = true;

        while(isPageError) {
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

                isPageError = false;
            } catch (e) {
                console.log("Error while loading page:", e);
                isPageError = true;
            }
        }

        // Close browser after the specified duration
        console.log("\n4. MAKE CODE RUN FOR SPECIFIED HOURS\n");

        // await sleep(settings.amountOfHoursRun * 60 * 60 * 1000);
        await sleep(10000); // Will run for 10 seconds only

        console.log(`Program ending after executing for ${settings.amountOfHoursRun} hours`);
        await resourceManager.release();
    } else {
        console.log(`Browser already taken at index ${browserIndex}`);
    }
}

async function main() {
    // SETTINGS
    console.log("\n0. SETTINGS\n");
    if (!fs.existsSync(SETTINGS_PATH)) {
        await setupSettings();
    }

    loadSettings();
    console.log("Settings loaded");

    // LOGIN
    console.log("\n1. LOGGING IN\n");

    const CheckerBrowser = await puppeteer.launch({ headless: true });
    let checkPage = await CheckerBrowser.newPage();

    await checkPage.goto(LOGIN_PAGE, { waitUntil: 'networkidle2' });

    let isCookiesLoaded = false;
    try {
        console.log("Loading cookies...");
        await loadCookiesAndLocalStorage(checkPage);
        await checkPage.goto('https://www.linkedin.com/feed/');
        isCookiesLoaded = await isLoginSuccessful(checkPage);
        if (isCookiesLoaded) {
            console.log('Cookies and Local Storage loaded successfully.');
        }
    } catch (error) {
        console.error('Error loading cookies/local storage:', error);
    }

    await CheckerBrowser.close(); // Close browser to get to main program

    if (!isCookiesLoaded) {
        console.log('\nFailed to load cookies/local storage. Please log in manually.');
        let loginSuccessful;
        do {
            let { newPage, newBrowser } = await login();

            loginSuccessful = await isLoginSuccessful(newPage);
            if (loginSuccessful) {
                await saveCookiesAndLocalStorage(newPage);
                console.log('Login successful and data saved.');
            } else {
                console.log('\nLogin failed. Please check your credentials and try again.');
            }

            await newBrowser.close();

        } while(!loginSuccessful);
    }

    // HEAD TO www.linkedin.com
    console.log("\n2. GOTO LINKEDIN.COM\n");

    // Get screen dimensions dynamically
    const screenInfo = await puppeteer.launch({ 
        headless: settings.shouldBrowseInHeadless,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const screenPage = await screenInfo.newPage();

    // Evaluate the window dimensions within the page context
    const { screenWidth, screenHeight } = await screenPage.evaluate(() => {
        return {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height
        };
    });

    console.log('Screen Width:', screenWidth, 'Screen Height:', screenHeight);
    await screenInfo.close();

    const halfWidth = screenWidth / 2;
    const halfHeight = screenHeight / 2;

    console.log('Half Width:', halfWidth, 'Half Height:', halfHeight);

    // Define quadrants
    let quadrants;

    switch (settings.numberOfPagesOpened) {
        case 1:
            quadrants = [
                { x: 0, y: 0, width: screenWidth, height: screenHeight },
            ];
            break;
        case 2:
            quadrants = [
                { x: 0, y: 0, width: halfWidth, height: screenHeight },
                { x: halfWidth, y: 0, width: halfWidth, height: screenHeight }
            ];
            break;
        default:
            quadrants = [
                { x: 0, y: 0, width: halfWidth, height: halfHeight },
                { x: halfWidth, y: 0, width: halfWidth, height: halfHeight },
                { x: 0, y: halfHeight, width: halfWidth, height: halfHeight },
                { x: halfWidth, y: halfHeight, width: halfWidth, height: halfHeight }
            ];
    }

    // Open multiple browser instances concurrently
    while(settings.numberOfTimesProgramShouldRun) {
        await Promise.all(
            Array.from({ length: settings.numberOfPagesOpened }, async (_, index) => {
                const currentQuadrant = quadrants[(index) % quadrants.length];
                await performAutomationTask(index, currentQuadrant);
            })
        );
        resourceManagers.splice(0, resourceManagers.length);
        settings.numberOfTimesProgramShouldRun--;
    }
}

// Function to check if the current time is 8 AM
function isTimeToRun() {
    const now = new Date();
    return now.getHours() === 8 && now.getMinutes() === 0;
}

// Function to set an interval to frequently check the time
function setFrequentCheckInterval() {
    const interval = setInterval(() => {
        if (isTimeToRun()) {
            clearInterval(interval); // Clear the interval
            runMain(); // Run the main function
            setDailySchedule(); // Set the daily schedule
        }
    }, 60000); // Check every minute
}

// Function to set the daily schedule at 8 AM
function setDailySchedule() {
    schedule.scheduleJob('0 8 * * *', () => {
        runMain();
    });
}

// Wrapper to run the main function
async function runMain() {
    await main().catch(console.error);
}

// Initial check at startup
if (isTimeToRun()) {
    runMain(); // Run the main function immediately
    setDailySchedule(); // Set the daily schedule
} else {
    setFrequentCheckInterval(); // Set frequent check interval
}

// Manually run the script immediately if needed for testing
if (process.argv.includes('--run-now')) {
    (async () => {
        await main().catch(console.error);
        process.exit(0);
    })();
}