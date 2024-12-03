import { HttpRequest } from "@azure/functions";
import { PlaywrightCrawler } from './crawler';

const clients = new Set<any>();

interface Context {
    log: {
        (...args: any[]): void;
        error: (...args: any[]) => void;
    };
    res: {
        status?: number;
        body?: any;
        headers?: { [key: string]: string };
    };
    bindingData: {
        req?: {
            socket?: {
                on: (event: string, handler: () => void) => void;
            };
        };
    };
}

const startCrawl = async function (context: Context, req: any): Promise<void> {
    context.log('Start Crawl function processing request.');

    const url = (req.body && req.body.url) || (req.query && req.query.url);
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
    } catch (error: any) {
        context.log.error('Error starting crawl:', error);
        context.res = {
            status: 500,
            body: { error: error?.message || 'Unknown error occurred' }
        };
    }
};

const sseConnection = async function (context: Context, req: any): Promise<void> {
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

    // Handle connection close using context.bindingData
    if (context.bindingData?.req?.socket) {
        context.bindingData.req.socket.on('close', () => {
            clients.delete(context.res);
        });
    }
};

export { startCrawl, sseConnection };
