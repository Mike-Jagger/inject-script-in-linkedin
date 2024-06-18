const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require('random-useragent');
puppeteer.use(StealthPlugin());

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36';

class ResourceManager {
    constructor(loadImages = false) {
        this.browser = null;
        this.retries = 0;
        this.isReleased = false;
        this.loadImages = loadImages;
    }

    async init() {
        this.isReleased = false;
        this.retries = 0;
        this.browser = await this.runBrowser();
    }

    async release() {
        this.isReleased = true;
        if (this.browser) await this.browser.close();
    }

    async createPage(url) {
        if (!this.browser) this.browser = await this.runBrowser();
        return await this.createPageInBrowser(url);
    }

    async runBrowser() {
        const bw = await puppeteer.launch({
            headless: settings.shouldBrowseInHeadless,
            args: [
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
            if (this.retries <= 3) {
                this.retries += 1;
                if (this.browser && this.browser.process() != null) this.browser.process().kill('SIGINT');
                await this.init();
            } else {
                throw "BROWSER crashed more than 3 times";
            }
        });

        return bw;
    }

    async createPageInBrowser(url) {
        const userAgent = randomUseragent.getRandom();
        const UA = userAgent || USER_AGENT;
        const page = await this.browser.newPage();
        await page.setViewport({
            width: 1920 + Math.floor(Math.random() * 100),
            height: 1080 + Math.floor(Math.random() * 100),
            deviceScaleFactor: 1,
            hasTouch: false,
            isLandscape: false,
            isMobile: false
        });
        await page.setUserAgent(UA);
        await page.setJavaScriptEnabled(true);
        await page.setDefaultNavigationTimeout(0);
        if (!this.loadImages) {
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image') {
                    req.abort();
                } else {
                    req.continue();
                }
            });
        }
        return page;
    }
}

module.exports = { ResourceManager };