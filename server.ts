import express from 'express';
import cors from 'cors';
import { PlaywrightCrawler } from './crawler';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Store active SSE clients
const clients = new Set<express.Response>();

// SSE endpoint for receiving updates
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write('data: {"type":"info","data":"Connected to SSE"}\n\n');

    // Add client to the set
    clients.add(res);

    // Remove client when connection closes
    req.on('close', () => {
        clients.delete(res);
    });
});

// Endpoint to start crawling
app.post('/start-crawl', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`Starting crawl for URL: ${url}`);
        const crawler = new PlaywrightCrawler(clients);
        await crawler.startCrawling(url);
        
        res.json({ message: 'Crawling started' });
    } catch (error) {
        console.error('Error starting crawl:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Screenshot service started on http://localhost:${port}`);
});
