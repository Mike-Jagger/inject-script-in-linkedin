const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { sleep } = require('./sleep');
const { clickButton } = require('./clickButton');

const COOKIES_PATH = './auth/cookies.json';
const SETTINGS_PATH = './settings.json';
const LOCAL_STORAGE_PATH = './auth/localStorage.json';
const TXT_KEYWORDS = './keywords.txt';
const JSON_KEYWORDS = './keywords.json';
const TEST_SCRIPT = './test.js';
const LOGIN_PAGE = 'https://www.linkedin.com/login';

// Load settings from JSON file
let settings = {
    shouldBrowseInHeadless: false,
    numberOfPagesOpened: 1,
    amountOfHoursRun: 2
};

function loadSettings() {
    if (fs.existsSync(SETTINGS_PATH)) {
        const settingsData = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
        settings = settingsData.Settings;
    }
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
    settings.numberOfPagesOpened = parseInt(await askQuestion('How many browser windows do you want to open? (default: 1): ')) || 1;
    settings.amountOfHoursRun = parseInt(await askQuestion('How many hours should the program run? (default: 2): ')) || 2;

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

async function performAutomationTask(currentKeyWord) {
    const browser = await puppeteer.launch({ 
        headless: settings.shouldBrowseInHeadless,
        defaultViewport: null, //Defaults to an 800x600 viewport
        args:['--start-maximized' ]
    });

    const page = await browser.newPage();

    await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle2' });

    await loadCookiesAndLocalStorage(page);

    await page.goto('https://www.linkedin.com/');

    // Set the display of the element with id msg-overlay to none
    await page.waitForSelector('aside[id="msg-overlay"]', { timeout: 60000 });
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
    await sleep(2000);

    await clickButton(page, ['Posts']);

    // OPEN AND CLEAR CONSOLE
    console.log("\n3. OPEN AND CLEAR CONSOLE\n");
    await executeTestScriptInConsole(page, TEST_SCRIPT);

    // Close browser after the specified duration
    console.log("\n4. MAKE CODE RUN FOR SPECIFIED HOURS\n");
    await sleep(settings.amountOfHoursRun * 60 * 60 * 1000);
    // await sleep(10000);
    console.log(`Program ending after executing for ${settings.amountOfHoursRun} hours`);
    await browser.close();
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

    await updateKeywordsFromFile();
    await moveToNextKeyword();

    // Load the current keyword
    const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);
    let currentKeyWord = {};
    if (fs.existsSync(jsonKeywordsPath)) {
        const jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
        currentKeyWord = jsonKeywords.currentKeyWord;
    }

    // Open multiple browser instances concurrently
    await Promise.all(
        Array.from({ length: settings.numberOfPagesOpened }, () => performAutomationTask(currentKeyWord))
    );
}

// Schedule the main function to run at 8 am Pacific Time every day
const job = schedule.scheduleJob('0 8 * * *', () => {
    main().catch(console.error);
});

// Manually run the script immediately if needed for testing
if (process.argv.includes('--run-now')) {
    main().catch(console.error);
}