import express from 'express';
// No longer using proxy middleware
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

// Create a simple proxy handler function
const proxyHandler = async (req, res) => {
  try {
    // Remove /api prefix from the path
    const targetPath = req.url.replace(/^\/api/, '');
    const targetUrl = `${firecrawlApiUrl}${targetPath}`;

    console.log(`Proxying ${req.method} ${req.path} to ${targetUrl}`);

    // Create options for the proxy request
    const options = {
      method: req.method,
      headers: { ...req.headers }
    };

    // Add API key if provided
    if (firecrawlApiKey) {
      options.headers['Authorization'] = `Bearer ${firecrawlApiKey}`;
    }

    // Remove host header to avoid conflicts
    delete options.headers.host;

    // Handle request body for POST/PUT requests
    let body = null;
    if (req.method === 'POST' || req.method === 'PUT') {
      // Parse request body
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const bodyData = Buffer.concat(chunks).toString();
          resolve(bodyData);
        });
      });

      // Add body to request options
      if (body) {
        options.body = body;
        // Ensure content-type is set
        if (!options.headers['content-type']) {
          options.headers['content-type'] = 'application/json';
        }
      }
    }

    // Use native fetch for proxying
    const proxyRes = await fetch(targetUrl, options);

    // Copy status and headers
    res.statusCode = proxyRes.status;

    // Copy headers
    proxyRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Get response body
    const responseBody = await proxyRes.text();

    // Send response
    res.end(responseBody);

  } catch (err) {
    console.error('Proxy error:', err);
    res.writeHead(500, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
};

// Use the proxy handler for all /api routes
app.use('/api', proxyHandler);

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
