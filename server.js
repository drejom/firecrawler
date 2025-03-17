import express from 'express';
// Use our custom proxy middleware
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import open from 'open';

// Load environment variables from .env file
dotenv.config();

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';
const loglevel = process.env.LOG_LEVEL || 'info';

// Define API target and optional key
const firecrawlApiUrl = process.env.FIRECRAWL_API_URL || 'http://firecrawl:3002';
const firecrawlApiKey = process.env.FIRECRAWL_API_KEY || '';

// Enable CORS for all routes
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Create proxy middleware for Firecrawl API
const apiProxy = createProxyMiddleware({
  target: firecrawlApiUrl,
  changeOrigin: true,
  pathRewrite: {
    '^/api': '', // Remove /api prefix when forwarding
  },
  // @ts-ignore - logLevel is a valid property in http-proxy-middleware
  logLevel: loglevel,
  onProxyReq: (proxyReq, req, res) => {
    // Log proxy requests
    console.log(`Proxying ${req.method} ${req.path} to ${firecrawlApiUrl}`);

    // Add API key to request if provided
    if (firecrawlApiKey) {
      proxyReq.setHeader('Authorization', `Bearer ${firecrawlApiKey}`);
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.writeHead(500, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
});

// Use the proxy middleware
app.use('/api', apiProxy);

// Endpoint to get API configuration
app.get('/config', (req, res) => {
  res.json({
    apiEndpoint: firecrawlApiUrl,
    apiKey: firecrawlApiKey ? true : false // Only send whether a key is configured, not the actual key
  });
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, host, () => {
  console.log(`Proxying API requests to ${firecrawlApiUrl}`);
  console.log(`Server listening on ${host}:${port}`);

  // log the url and port we're running on so the user can click it
  const appUrl = `http://localhost:${port}`;
  console.log(`Application started: ${appUrl}`);

  // Open browser unless OPEN_BROWSER is set to 'false'
  const shouldOpenBrowser = process.env.OPEN_BROWSER !== 'false';
  if (shouldOpenBrowser) {
    open(appUrl).catch(err => {
      console.error('Failed to open browser:', err);
    });
    console.log('Browser opened automatically. Set OPEN_BROWSER=false to disable this behaviour.');
  }
});
