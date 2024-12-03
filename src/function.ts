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

const healthCheck = async function (context: Context, req: any): Promise<void> {
    context.log('Health check endpoint called');
    
    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: {
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch
            }
        }
    };
};

const startCrawl = async function (context: any, req: any): Promise<void> {
    context.log('Start Crawl function processing request.');
    context.log('Request body:', req.body);

    try {
        if (!req.body) {
            context.res = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Request body is required' })
            };
            return;
        }

        const url = req.body.url;
        if (!url) {
            context.res = {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'URL is required' })
            };
            return;
        }

        const crawler = new PlaywrightCrawler();
        context.log('Starting crawl for URL:', url);
        const screenshotBase64 = await crawler.startCrawling(url);
        context.log('Screenshot captured successfully');
        
        context.res = {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                message: 'Screenshot captured',
                url,
                screenshot: `data:image/jpeg;base64,${screenshotBase64}`
            })
        };
    } catch (error: any) {
        context.log.error('Error in startCrawl:', error);
        context.res = {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                error: error?.message || 'Unknown error occurred',
                stack: error?.stack,
                details: error?.toString()
            })
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

export { startCrawl, sseConnection, healthCheck };
