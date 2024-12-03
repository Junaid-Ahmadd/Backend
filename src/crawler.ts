import { chromium, Browser, Page } from 'playwright-chromium';
import * as path from 'path';
import * as fs from 'fs';

export class PlaywrightCrawler {
    private browser: Browser | null = null;

    async startCrawling(url: string) {
        try {
            console.log('Starting browser...');
            this.browser = await chromium.launch({
                headless: true,
                executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--single-process'
                ]
            });

            console.log('Creating new page...');
            const page = await this.browser.newPage();
            
            console.log(`Navigating to ${url}...`);
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });

            console.log('Taking screenshot...');
            const screenshot = await page.screenshot({
                fullPage: true,
                type: 'jpeg',
                quality: 80
            });

            console.log('Converting screenshot to base64...');
            const base64Image = Buffer.from(screenshot).toString('base64');
            
            console.log('Cleanup...');
            await page.close();
            await this.cleanup();

            return base64Image;
        } catch (error: any) {
            console.error('Error in crawler:', error);
            await this.cleanup();
            throw error;
        }
    }

    private async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
