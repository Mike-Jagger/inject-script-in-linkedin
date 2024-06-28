const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
// const randomUseragent = require('random-useragent');
puppeteer.use(StealthPlugin());

const { sleep } = require('./sleep');
const { injectScript } = require('./task');
const { acquireLock, releaseLock, updateKeywordsFromFile, moveToNextKeyword } = require('./manageKeywords');
const { loadCookiesAndLocalStorage } = require('./loadCookiesAndLocalStorage');
const LOGIN_PAGE = 'https://www.linkedin.com/login';
const JSON_KEYWORDS = './testKeywords.json';

class ResourceManager {
    constructor(settings, quadrant, currentKeyWord) {
        this.browser = null;
        this.browserWSEndpoint = null;
        this.page = null;
        this.settings = settings;
        this.quadrant = quadrant;
        this.currentKeyWord = currentKeyWord;
        this.retries = 0;
        this.isReleased = false;
    }

    async init() {
        this.isReleased = false;
        this.retries = 0;
        this.browser = await this.runBrowser();
        console.log(this.browser.process().pid);
        this.browserWSEndpoint = this.browser.wsEndpoint();
        this.page = await this.createPage();

        await this.page.goto(LOGIN_PAGE);

        sleep(3000);

        await loadCookiesAndLocalStorage(this.page);

        await this.page.evaluate(() => {
            document.body.style.zoom = '67%';
        });

        let pageErrCount = 3;

        while(pageErrCount && this.page) {
            // this.browser.disconnect();
            try {
                await injectScript(this.page, this.currentKeyWord);

                // Monitor scrolling activity
                let lastScrollPosition = 0;
                let lastScrollTime = Date.now();

                // Function to monitor the scrolling activity
                const monitorScroll = async () => {
                    while (this.page) {
                        const newScrollPosition = await this.page.evaluate(() => window.scrollY);

                        if (newScrollPosition !== lastScrollPosition) {
                            lastScrollPosition = newScrollPosition;
                            lastScrollTime = Date.now();
                        }

                        await sleep(2000); // Check every 10 seconds
                        if (Date.now() - lastScrollTime > 5 * 1000) { // 10 minutes
                            console.log("No scrolling detected for 10 minutes. Restarting the browser.");
                            if (!this.isReleased) {
                                await this.release();

                                await acquireLock();
                                try {
                                    await updateKeywordsFromFile();
                                    await moveToNextKeyword();
                                } finally {
                                    releaseLock();
                                }

                                // Load the current keyword
                                const jsonKeywordsPath = path.resolve(__dirname, JSON_KEYWORDS);
                                if (fs.existsSync(jsonKeywordsPath)) {
                                    const jsonKeywords = JSON.parse(fs.readFileSync(jsonKeywordsPath, 'utf-8'));
                                    this.currentKeyWord = jsonKeywords.currentKeyWord;
                                }

                                await this.init();
                            }
                            break;
                        }
                    }
                };

                monitorScroll();
                pageErrCount = 0;

            } catch (e) {
                console.log("Error while loading page:", e);
                try {
                    await page.goto(LOGIN_PAGE);
                } catch(e) {
                    console.error("Error redirecting to login page (most likely browser crash): ", e);
                    await this.release();
                }
                sleep(2000);
                pageErrCount--;
            }
        }
    }

    async release() {
        this.isReleased = true;
        if (this.page) {
            try {
                await this.page.close();
            } catch (e) {
                console.error("Error closing page: ", e);
            }
        }
        this.page = null;
        if (this.browser) {
            try {
                await this.browser.close();
            } catch (e) {
                console.error("Error closing browser: ", e);
            }
        }
        if (this.browser && this.browser.process() != null) {
            try {
                this.browser.process().kill('SIGTERM');
            } catch (e) {
                console.error("Error killing browser process: ", e);
            }
        }
        this.browser = null;
    }

    async createPage(url) {
        if (!this.browser) this.browser = await this.runBrowser();
        return await this.createPageInBrowser(url);
    }

    async runBrowser() {
        const bw = await puppeteer.launch({
            headless: this.settings.shouldBrowseInHeadless,
            defaultViewport: null, //Defaults to an 800x600 viewport
            args: [
                '--start-maximized',
                `--window-size=${this.quadrant.width},${this.quadrant.height}`,
                `--window-position=${this.quadrant.x},${this.quadrant.y}`,
                '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--disable-accelerated-2d-canvas', '--disable-dev-shm-usage',
                '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-translate', '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-notifications', '--disable-default-apps',
                '--disable-hang-monitor', '--disable-prompt-on-repost', '--disable-client-side-phishing-detection', '--disable-popup-blocking',
                '--disable-component-update', '--disable-domain-reliability', '--disable-features=AudioServiceOutOfProcess', '--disable-print-preview',
                '--disable-software-rasterizer', '--disable-web-security', '--disable-site-isolation-trials', '--disable-gpu'
            ]
        });

        bw.on('disconnected', async () => {
            if (this.isReleased) return;
            console.log("BROWSER CRASH");
            if (this.retries <= 3 && !this.isReleased) {
                this.retries += 1;
                const browserToDisconnect = await puppeteer.connect({browserWSEndpoint: this.browserWSEndpoint}) || null;

                if (browserToDisconnect) await browserToDisconnect.close();
                if (browserToDisconnect && browserToDisconnect.process() != null) browserToDisconnect.process().kill('SIGINT');
                if (this.page) { this.page.close(); this.page = null };

                if (!this.isReleased) await this.init();
            } else {
                throw "BROWSER crashed more than 3 times";
            }
        });

        return bw;
    }

    async createPageInBrowser() {
        // const userAgent = randomUseragent.getRandom();
        // const UA = userAgent || USER_AGENT;
        const page = await this.browser.newPage();
        // await page.setUserAgent(UA);
        await page.setJavaScriptEnabled(true);
        await page.setDefaultNavigationTimeout(0);

        await page.setDefaultTimeout(3600 * 1000);

        // Block unnecessary resources
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const blockTypes = ['image', 'font'];
            if (blockTypes.includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // Disable animations and JavaScript timers
        await page.evaluateOnNewDocument(() => {
            const style = document.createElement('style');
            style.innerHTML = `
                *, *::before, *::after {
                    animation: none !important;
                    transition: none !important;
                }
            `;
            document.head.appendChild(style);

            // Disable JavaScript timers
            const _setTimeout = window.setTimeout;
            window.setTimeout = (fn, delay, ...args) => {
                return _setTimeout(fn, Math.min(delay, 1000), ...args);
            };
        });

        return page;
    }
}

module.exports = { ResourceManager };