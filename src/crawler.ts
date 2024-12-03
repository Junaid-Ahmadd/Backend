import { chromium, Browser, Page } from 'playwright-chromium';
import * as path from 'path';
import * as fs from 'fs';

interface Response {
    write: (data: string) => void;
}

export class PlaywrightCrawler {
    private visitedUrls = new Set<string>();
    private queue: Array<{ url: string; depth: number }> = [];
    private processing = new Set<string>();
    private baseUrl = "";
    private domain = "";
    private maxConcurrent = 3; // Reduced from 5 due to resource intensity of screenshots
    private activeRequests = 0;
    private maxPages = 100;
    private currentDepth = 0;
    private urlsByDepth: Map<number, string[]> = new Map();
    private browser: Browser | null = null;
    private screenshotDir: string;

    constructor(
        private clients: Set<Response>,
        screenshotDir = path.join(process.cwd(), 'screenshots')
    ) {
        this.screenshotDir = screenshotDir;
        if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
        }
    }

    private sendUpdate(type: "link" | "error" | "info" | "depth" | "screenshot", data: unknown) {
        const message = `data: ${JSON.stringify({ type, data })}\n\n`;
        this.clients.forEach(client => {
            try {
                client.write(message);
            } catch (error) {
                console.error('Error sending SSE update:', error);
                this.clients.delete(client);
            }
        });
    }

    private isValidUrl(url: string): boolean {
        try {
            const parsedUrl = new URL(url);
            // Ignore non-HTML resources and external domains
            if (!parsedUrl.pathname.match(/\.(html?|php|aspx?|jsp)$/i) && 
                parsedUrl.pathname !== "/" && 
                !parsedUrl.pathname.endsWith("/")) {
                return false;
            }
            return parsedUrl.hostname === this.domain;
        } catch {
            return false;
        }
    }

    private normalizeUrl(url: string): string {
        try {
            const parsedUrl = new URL(url, this.baseUrl);
            parsedUrl.hash = ""; // Remove fragments
            return parsedUrl.href;
        } catch {
            return "";
        }
    }

    private async extractLinks(page: Page): Promise<string[]> {
        // Extract all links using Playwright
        const links = await page.evaluate(() => {
            const anchors = document.querySelectorAll('a');
            return Array.from(anchors)
                .map(anchor => anchor.href)
                .filter(href => href); // Filter out empty hrefs
        });
        return links;
    }

    private async takeScreenshot(page: Page, url: string): Promise<string> {
        try {
            // Set viewport size and scroll to capture full page
            await page.setViewportSize({ width: 1280, height: 720 });

            // Handle common overlay selectors (cookie banners, popups)
            const commonOverlaySelectors = [
                'button:has-text("Accept")',
                'button:has-text("Accept All")',
                'button:has-text("OK")',
                'button:has-text("I Accept")',
                'button:has-text("Close")',
                '[aria-label="Accept cookies"]',
                '#cookie-notice button',
                '.cookie-banner button',
                '.consent-banner button'
            ];

            // Try to handle cookie banners and popups
            try {
                for (const selector of commonOverlaySelectors) {
                    const button = await page.$(selector);
                    if (button) {
                        await button.click().catch(() => {});
                        break;
                    }
                }
            } catch (e) {
                // Ignore errors from popup handling
            }

            // Wait for any dynamic content with a shorter timeout
            try {
                await page.waitForLoadState('networkidle', { timeout: 5000 });
            } catch (e) {
                console.log(`Network idle wait timed out for ${url}, continuing with screenshot`);
            }

            // Ensure the page is scrolled to top before screenshot
            await page.evaluate(() => window.scrollTo(0, 0));

            // Take screenshot as buffer
            const screenshot = await page.screenshot({
                fullPage: true,
                type: 'jpeg',
                quality: 80
            });

            // Convert to base64 data URL
            const base64Image = Buffer.from(screenshot).toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64Image}`;

            return dataUrl;
        } catch (error: any) {
            console.error(`Screenshot error for ${url}:`, error);
            throw error;
        }
    }

    private async processUrl(url: string, depth: number) {
        if (this.processing.has(url) || this.visitedUrls.size >= this.maxPages) return;
        this.processing.add(url);
        this.activeRequests++;

        let page: Page | null = null;
        try {
            this.sendUpdate("info", `Crawling: ${url}`);
            
            // Create a new page for this URL
            if (!this.browser) throw new Error("Browser not initialized");
            page = await this.browser.newPage();
            
            // Set reasonable timeout and navigate
            await page.setDefaultTimeout(30000);
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            // Extract links using Playwright
            const links = await this.extractLinks(page);
            
            // Take screenshot and get data URL
            const screenshotDataUrl = await this.takeScreenshot(page, url);
            this.sendUpdate("screenshot", { 
                url, 
                data: screenshotDataUrl 
            });

            // Add URL to its depth level
            if (!this.urlsByDepth.has(depth)) {
                this.urlsByDepth.set(depth, []);
            }
            this.urlsByDepth.get(depth)?.push(url);
            this.sendUpdate("depth", { depth, url });

            // Process extracted links
            if (this.visitedUrls.size < this.maxPages) {
                for (const link of links) {
                    const normalizedLink = this.normalizeUrl(link);
                    if (normalizedLink && !this.visitedUrls.has(normalizedLink) && this.isValidUrl(normalizedLink)) {
                        this.visitedUrls.add(normalizedLink);
                        this.queue.push({ url: normalizedLink, depth: depth + 1 });
                        this.sendUpdate("link", { 
                            url: normalizedLink, 
                            depth: depth + 1, 
                            total: this.visitedUrls.size 
                        });
                    }
                }
            }
        } catch (error: any) {
            this.sendUpdate("error", `Error processing ${url}: ${error?.message || 'Unknown error'}`);
        } finally {
            if (page) await page.close();
            this.processing.delete(url);
            this.activeRequests--;
            this.processQueue();
        }
    }

    private async processQueue() {
        if (this.visitedUrls.size >= this.maxPages) {
            if (this.activeRequests === 0) {
                this.sendUpdate("info", "Crawling completed (reached maximum page limit)");
            }
            return;
        }

        while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const nextItem = this.queue.shift();
            if (nextItem) {
                const { url, depth } = nextItem;
                if (depth > this.currentDepth) {
                    if (this.activeRequests === 0) {
                        this.currentDepth = depth;
                        this.sendUpdate("info", `Processing depth ${depth}`);
                    } else {
                        this.queue.unshift(nextItem);
                        break;
                    }
                }
                this.processUrl(url, depth);
            }
        }

        if (this.queue.length === 0 && this.activeRequests === 0) {
            this.sendUpdate("info", "Crawling completed");
            await this.cleanup();
        }
    }

    private async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async startCrawling(url: string) {
        try {
            const parsedUrl = new URL(url);
            this.baseUrl = url;
            this.domain = parsedUrl.hostname;
            
            // Reset state
            this.visitedUrls.clear();
            this.queue = [];
            this.processing.clear();
            this.activeRequests = 0;
            this.currentDepth = 0;
            this.urlsByDepth.clear();

            // Initialize browser
            this.browser = await chromium.launch({
                headless: true
            });

            // Start with the base URL at depth 0
            this.visitedUrls.add(url);
            this.queue.push({ url, depth: 0 });
            this.processQueue();
        } catch (error: any) {
            this.sendUpdate("error", `Invalid URL: ${error?.message || 'Unknown error'}`);
            await this.cleanup();
        }
    }
}
