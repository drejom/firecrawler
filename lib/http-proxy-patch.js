/**
 * ESM-compatible proxy middleware
 * This is a simplified version of http-proxy-middleware for ESM
 *
 * Note: The underlying http-proxy package uses the deprecated util._extend
 * We handle this by setting NODE_NO_WARNINGS=1 in the environment
 * rather than monkey-patching Node.js internals
 */
import httpProxy from 'http-proxy';
const { createProxyServer } = httpProxy;

/**
 * Create a proxy middleware function
 * @param {Object} options - Proxy options
 * @returns {Function} Middleware function
 */
const createProxyMiddleware = (options = {}) => {
  // Create a proxy server
  const proxy = createProxyServer({
    target: options.target,
    changeOrigin: options.changeOrigin || false,
    ws: options.ws || false,
    secure: options.secure !== false,
    xfwd: options.xfwd || false,
    toProxy: options.toProxy || false,
    prependPath: options.prependPath !== false,
    ignorePath: options.ignorePath || false,
    autoRewrite: options.autoRewrite || false,
    protocolRewrite: options.protocolRewrite || null
  });

  // Handle proxy errors
  proxy.on('error', (err, req, res) => {
    if (options.onError) {
      options.onError(err, req, res);
    } else {
      console.error('Proxy error:', err);
      // Check if res is a ServerResponse (not a Socket for websockets)
      // @ts-ignore - TypeScript doesn't understand the runtime check
      if (res && typeof res.writeHead === 'function') {
        // @ts-ignore - TypeScript doesn't understand the runtime check
        if (!res.headersSent) {
          // @ts-ignore - TypeScript doesn't understand the runtime check
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          // @ts-ignore - TypeScript doesn't understand the runtime check
          res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
        }
      }
    }
  });

  // Handle proxy request
  if (options.onProxyReq) {
    proxy.on('proxyReq', (proxyReq, req, res) => {
      options.onProxyReq(proxyReq, req, res);
    });
  }

  // Return middleware function
  return (req, res, next) => {
    // Apply path rewrite if specified
    if (options.pathRewrite) {
      const originalUrl = req.url;

      // Handle path rewriting manually to avoid path-to-regexp issues
      if (options.pathRewrite['^/api'] === '') {
        // Special case for our common pattern
        if (req.url.startsWith('/api')) {
          req.url = req.url.substring(4); // Remove '/api' prefix
        }
      } else {
        // For other patterns, use simple string replacement
        Object.keys(options.pathRewrite).forEach((pattern) => {
          try {
            // Remove ^ and $ from pattern for simple string replacement
            const cleanPattern = pattern.replace(/^\^|\$$/g, '');
            const replacement = options.pathRewrite[pattern];

            if (req.url.includes(cleanPattern)) {
              req.url = req.url.replace(cleanPattern, replacement);
            }
          } catch (err) {
            console.error(`Path rewrite error for pattern ${pattern}:`, err);
          }
        });
      }

      // Log rewrite if debug is enabled
      if (options.logLevel === 'debug') {
        console.log(`Rewriting path from ${originalUrl} to ${req.url}`);
      }
    }

    // Log proxy request if debug is enabled
    if (options.logLevel === 'debug') {
      console.log(`Proxying ${req.method} ${req.url} to ${options.target}`);
    }

    // Web proxy request
    proxy.web(req, res, {}, (err) => {
      if (err) {
        if (next) next(err);
      }
    });
  };
};

console.log('ESM-compatible proxy middleware loaded');

export { createProxyMiddleware };
