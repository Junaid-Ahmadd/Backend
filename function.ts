import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { PlaywrightCrawler } from './crawler';

const clients = new Set<any>();

const startCrawl: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('Start Crawl function processing request.');

    const url = req.body?.url;
    if (!url) {
        context.res = {
            status: 400,
            body: { error: 'URL is required' }
        };
        return;
    }

    try {
        const crawler = new PlaywrightCrawler(clients);
        await crawler.startCrawling(url);
        
        context.res = {
            status: 200,
            body: { message: 'Crawling started' }
        };
    } catch (error) {
        context.log.error('Error starting crawl:', error);
        context.res = {
            status: 500,
            body: { error: error.message }
        };
    }
};

const sseConnection: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('SSE Connection function processing request.');
    
    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        },
        body: 'data: {"type":"info","data":"Connected to SSE"}\n\n'
    };

    // Add client to the set
    clients.add(context.res);

    // Handle connection close
    req.on('close', () => {
        clients.delete(context.res);
    });
};

export { startCrawl, sseConnection };
