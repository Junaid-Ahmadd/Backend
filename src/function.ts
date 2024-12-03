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
    context.log('Request body:', req.body);

    try {
        const url = (req.body && req.body.url) || (req.query && req.query.url);
        if (!url) {
            context.res = {
                status: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*'
                },
                body: { error: 'URL is required' }
            };
            return;
        }

        const crawler = new PlaywrightCrawler(clients);
        await crawler.startCrawling(url);
        
        context.res = {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: { message: 'Crawling started', url }
        };
    } catch (error: any) {
        context.log.error('Error starting crawl:', error);
        context.res = {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*'
            },
            body: { 
                error: error?.message || 'Unknown error occurred',
                stack: error?.stack
            }
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
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
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
