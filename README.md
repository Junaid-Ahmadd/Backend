# Screenshot Service Backend

A web crawler service that captures screenshots of web pages using Playwright.

## Features

- Crawls websites and captures screenshots
- Uses Server-Sent Events (SSE) for real-time updates
- Configurable crawl depth and concurrent requests
- Screenshot optimization with JPEG compression
- Handles cookie banners and popups automatically

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm run dev
```

The server will start on http://localhost:3000

## API Endpoints

- `GET /events` - SSE endpoint for real-time updates
- `POST /start-crawl` - Start crawling a website
  - Body: `{ "url": "https://example.com" }`

## Configuration

- Maximum pages to crawl: 100
- Concurrent requests: 3
- Screenshot resolution: 1280x720
- Screenshot format: JPEG (80% quality)

## Requirements

- Node.js
- TypeScript
- Playwright
