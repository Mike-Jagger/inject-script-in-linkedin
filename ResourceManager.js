const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require('random-useragent');
puppeteer.use(StealthPlugin());

class ResourceManager {
    constructor(settings, quadrant) {
        this.browser = null;
        this.settings = settings;
        this.quadrant = quadrant;
        this.retries = 0;
        this.isReleased = false;
    }

    async init() {
        this.isReleased = false;
        this.retries = 0;
        this.browser = await this.runBrowser();
    }

    async release() {
        this.isReleased = true;
        if (this.browser) await this.browser.close();
        if (this.browser?.process() != null) this.browser.process().kill('SIGINT');
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

    async createPageInBrowser() {
        const userAgent = randomUseragent.getRandom();
        const UA = userAgent || USER_AGENT;
        const page = await this.browser.newPage();
        await page.setUserAgent(UA);
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