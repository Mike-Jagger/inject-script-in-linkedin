const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { timeout } = require('puppeteer');

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

async function login(page) {
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
}

async function isLoginSuccessful(page) {
    try {
        await page.waitForSelector('button[aria-label="Click to start a search"]', { timeout: 10000 });
        return true;
    } catch (error) {
        return false;
    }
}

(async () => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle2' });

    let isCookiesLoaded = false;
    try {
        await loadCookiesAndLocalStorage(page);
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2' });
        isCookiesLoaded = await isLoginSuccessful(page);
        if (isCookiesLoaded) {
            console.log('Cookies and Local Storage loaded successfully.');
        }
    } catch (error) {
        console.error('Error loading cookies/local storage:', error);
    }

    if (!isCookiesLoaded) {
        await browser.close();
        console.log('Failed to load cookies/local storage. Please log in manually.');

        const newBrowser = await puppeteer.launch({ headless: false });
        const newPage = await newBrowser.newPage();
        await login(newPage);

        const loginSuccessful = await isLoginSuccessful(newPage);
        if (loginSuccessful) {
            await saveCookiesAndLocalStorage(page);
            console.log('Login successful and data saved.');
        } else {
            console.log('Login failed. Please check your credentials.');
        }

        // await newBrowser.close();
    } else {
        console.log('Already logged in with loaded cookies.');
    }

    // await browser.close();
})();