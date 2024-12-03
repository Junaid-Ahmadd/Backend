import { chromium, Browser, Page } from 'playwright-chromium';
import * as path from 'path';
import * as fs from 'fs';

export class PlaywrightCrawler {
    private browser: Browser | null = null;

    async startCrawling(url: string) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            throw new Error('Invalid URL: URL must start with http:// or https://');
        }

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
            try {
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 30000 
                });
            } catch (navigationError) {
                throw new Error(`Failed to load URL: ${navigationError.message}`);
            }

            console.log('Taking screenshot...');
            let screenshot;
            try {
                screenshot = await page.screenshot({
                    fullPage: true,
                    type: 'jpeg',
                    quality: 80
                });
            } catch (screenshotError) {
                throw new Error(`Failed to capture screenshot: ${screenshotError.message}`);
            }

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
            try {
                await this.browser.close();
            } catch (error) {
                console.error('Error during browser cleanup:', error);
            }
            this.browser = null;
        }
    }
}
