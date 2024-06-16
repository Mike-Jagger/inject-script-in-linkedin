const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { timeout } = require('puppeteer');
const { sleep } = require('./sleep');

const COOKIES_PATH = './auth/testCookies.json';
const LOCAL_STORAGE_PATH = './auth/testLocalStorage.json';
const LOGIN_PAGE = 'https://www.linkedin.com/login';

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

    const browser = await puppeteer.launch({ headless: false });

    const page = await browser.newPage();

    await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle2' });
    await page.type('#username', username);
    await page.type('#password', password);
    await page.click('button[type="submit"]');

    try{
        await page.waitForSelector('button[id="two-step-submit-button"]', { timeout: 10000 });
        console.log("Waiting for 2FA");
        await page.waitForSelector('button[aria-label="Click to start a search"]', { timeout: 60000 });
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

(async () => {
    let browser;
    const CheckerBrowser = await puppeteer.launch({ headless: false });
    const page = await CheckerBrowser.newPage();

    await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle2' });

    let isCookiesLoaded = false;
    try {
        await loadCookiesAndLocalStorage(page);
        await page.goto('https://www.linkedin.com/feed/');
        isCookiesLoaded = await isLoginSuccessful(page);
        if (isCookiesLoaded) {
            console.log('Cookies and Local Storage loaded successfully.');
        }
    } catch (error) {
        console.error('Error loading cookies/local storage:', error);
    }

    await CheckerBrowser.close(); // Close browser to get to main program

    if (!isCookiesLoaded) {
        console.log('Failed to load cookies/local storage. Please log in manually.');
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
    } else {
        console.log('Already logged in with loaded cookies.');
    }

    // await browser.close();
})();