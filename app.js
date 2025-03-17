document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const modeButtons = document.querySelectorAll('.mode-button');
    const modeOptions = document.querySelectorAll('.mode-options');
    const submitButton = document.getElementById('submit-button');
    const resultsPanel = document.getElementById('results-panel');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const loadingIndicator = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const crawlStatus = document.getElementById('crawl-status');
    const statusText = document.getElementById('status-text');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const apiUrlDisplay = document.getElementById('api-url');

    // Current mode
    let currentMode = 'scrape';
    let crawlJobId = null;
    let crawlCheckInterval = null;

    // Fetch API configuration from server
    async function fetchApiConfig() {
        try {
            const response = await fetch('/config');
            if (response.ok) {
                const config = await response.json();
                if (config.apiEndpoint) {
                    apiUrlDisplay.textContent = config.apiEndpoint;
                }
            }
        } catch (error) {
            console.error('Failed to fetch API configuration:', error);
        }
    }

    // Fetch API configuration on page load
    fetchApiConfig();

    // Initialize marked.js
    marked.use({
        renderer: {
            code(code, language) {
                const validLanguage = hljs.getLanguage(language) ? language : 'plaintext';
                return hljs.highlight(validLanguage, code).value;
            }
        }
    });
    marked.setOptions({
        renderer: new marked.Renderer(),
        pedantic: false,
        gfm: true,
        breaks: true,
        sanitize: false,
        smartypants: false,
        xhtml: false
    });

    // Event Listeners

    // Mode switching
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const mode = button.getAttribute('data-mode');
            switchMode(mode);
        });
    });

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Form submission
    submitButton.addEventListener('click', handleSubmit);

    // Functions

    // Switch between modes (scrape, crawl, extract)
    function switchMode(mode) {
        currentMode = mode;

        // Update active button
        modeButtons.forEach(button => {
            if (button.getAttribute('data-mode') === mode) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });

        // Show relevant options
        modeOptions.forEach(option => {
            if (option.classList.contains(`${mode}-options`)) {
                option.classList.remove('hidden');
            } else {
                option.classList.add('hidden');
            }
        });

        // Reset results
        resetResults();
    }

    // Switch between result tabs
    function switchTab(tabName) {
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab') === tabName) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        tabContents.forEach(content => {
            if (content.id === `${tabName}-tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
    }

    // Reset results panel
    function resetResults() {
        document.getElementById('markdown-preview').innerHTML = '';
        document.getElementById('json-preview').innerHTML = '';
        document.getElementById('screenshot-preview').innerHTML = '';
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
        crawlStatus.classList.add('hidden');
        resultsPanel.classList.add('hidden');

        // Clear any ongoing crawl checks
        if (crawlCheckInterval) {
            clearInterval(crawlCheckInterval);
            crawlCheckInterval = null;
        }
    }

    // Handle form submission
    async function handleSubmit() {
        const url = document.getElementById('url').value.trim();

        if (!url) {
            showError('Please enter a URL');
            return;
        }

        resetResults();
        showLoading(true);
        resultsPanel.classList.remove('hidden');

        try {
            switch (currentMode) {
                case 'scrape':
                    await handleScrape(url);
                    break;
                case 'crawl':
                    await handleCrawl(url);
                    break;
                case 'extract':
                    await handleExtract(url);
                    break;
            }
        } catch (error) {
            showError(`Error: ${error.message || 'Unknown error occurred'}`);
        } finally {
            showLoading(false);
        }
    }

    // Handle scrape mode
    async function handleScrape(url) {
        // Ensure URL has protocol and is properly formatted
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (e) {
            throw new Error('Invalid URL format. Please enter a valid URL.');
        }

        // Get selected formats
        const formats = Array.from(document.querySelectorAll('input[name="format"]:checked'))
            .map(checkbox => checkbox.value);

        // Get page options
        const onlyMainContent = document.querySelector('input[name="onlyMainContent"]:checked') !== null;
        const removeBase64Images = document.querySelector('input[name="removeBase64Images"]:checked') !== null;
        const waitFor = document.getElementById('waitFor').value || 2000;
        const timeout = document.getElementById('timeout').value || 30000;

        // Build request payload
        const payload = {
            url,
            formats,
            onlyMainContent,
            removeBase64Images,
            waitFor: parseInt(waitFor),
            timeout: parseInt(timeout)
        };

        console.log('Sending request to API:', payload);

        try {
            // Use our proxy server to avoid CORS issues
            const apiUrl = `/api/v1/scrape`;
            console.log('Using proxy for API URL:', apiUrl);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log('API Response status:', response.status);
            const data = await response.json();
            console.log('API Response data:', data);

            if (!response.ok) {
                // Check if this is a screenshot-related error
                if (formats.includes('screenshot') && data.error &&
                    (data.error.includes('All scraping engines failed') ||
                        data.error.includes('Internal server error'))) {
                    throw new Error('Screenshot functionality is not supported by this Firecrawl API instance. Please try without screenshot format.');
                } else {
                    throw new Error(data.error || `API returned status ${response.status}`);
                }
            }

            displayResults(data);
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // Handle crawl mode
    async function handleCrawl(url) {
        // Ensure URL has protocol and is properly formatted
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (e) {
            throw new Error('Invalid URL format. Please enter a valid URL.');
        }

        // Get crawl options
        const maxDepth = document.getElementById('maxDepth').value || 2;
        const limit = document.getElementById('limit').value || 10;
        const ignoreSitemap = document.querySelector('input[name="ignoreSitemap"]:checked') !== null;
        const allowExternalLinks = document.querySelector('input[name="allowExternalLinks"]:checked') !== null;

        // Get formats
        const formats = Array.from(document.querySelectorAll('input[name="crawlFormat"]:checked'))
            .map(checkbox => checkbox.value);

        // Get include/exclude paths
        const includePaths = document.getElementById('includePaths').value
            ? document.getElementById('includePaths').value.split(',').map(p => p.trim())
            : [];

        const excludePaths = document.getElementById('excludePaths').value
            ? document.getElementById('excludePaths').value.split(',').map(p => p.trim())
            : [];

        // Build request payload
        const payload = {
            url,
            maxDepth: parseInt(maxDepth),
            limit: parseInt(limit),
            ignoreSitemap,
            allowExternalLinks,
            scrapeOptions: {
                formats,
                onlyMainContent: true
            }
        };

        if (includePaths.length > 0) {
            payload.includePaths = includePaths;
        }

        if (excludePaths.length > 0) {
            payload.excludePaths = excludePaths;
        }

        console.log('Sending crawl request to API:', payload);

        try {
            // Use our proxy server to avoid CORS issues
            const apiUrl = `/api/v1/crawl`;
            console.log('Using proxy for API URL:', apiUrl);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log('API Response status:', response.status);
            const data = await response.json();
            console.log('API Response data:', data);

            if (!response.ok) {
                // Check if this is a screenshot-related error for crawl mode
                if (formats.includes('screenshot') && data.error &&
                    (data.error.includes('All scraping engines failed') ||
                        data.error.includes('Internal server error'))) {
                    throw new Error('Screenshot functionality is not supported by this Firecrawl API instance. Please try without screenshot format.');
                } else {
                    throw new Error(data.error || `API returned status ${response.status}`);
                }
            }

            // Show crawl status
            crawlStatus.classList.remove('hidden');
            crawlJobId = data.id;

            // Start checking crawl status
            checkCrawlStatus();
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // Handle extract mode
    async function handleExtract(url) {
        // Ensure URL has protocol and is properly formatted
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (e) {
            throw new Error('Invalid URL format. Please enter a valid URL.');
        }

        // Get extract options
        const prompt = document.getElementById('extractPrompt').value.trim();
        let schema = null;

        try {
            const schemaText = document.getElementById('extractSchema').value.trim();
            if (schemaText) {
                schema = JSON.parse(schemaText);
            }
        } catch (error) {
            throw new Error('Invalid JSON schema format');
        }

        // Get page options
        const waitFor = document.getElementById('waitFor').value || 2000;

        // Build request payload
        const payload = {
            url,
            formats: ['json'],
            jsonOptions: {},
            waitFor: parseInt(waitFor)
        };

        if (prompt) {
            payload.jsonOptions.prompt = prompt;
        }

        if (schema) {
            payload.jsonOptions.schema = schema;
        }

        console.log('Sending extract request to API:', payload);

        try {
            // Use our proxy server to avoid CORS issues
            const apiUrl = '/api/v1/scrape';
            console.log('Using proxy for API URL:', apiUrl);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log('API Response status:', response.status);
            const data = await response.json();
            console.log('API Response data:', data);

            if (!response.ok) {
                // Check if this is a screenshot-related error
                if (data.error &&
                    (data.error.includes('All scraping engines failed') ||
                        data.error.includes('Internal server error'))) {
                    throw new Error('The Firecrawl API instance encountered an error. If you were trying to use screenshot functionality, it may not be supported by this API instance.');
                } else {
                    throw new Error(data.error || `API returned status ${response.status}`);
                }
            }

            displayResults(data);
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    // Check crawl status
    async function checkCrawlStatus() {
        if (!crawlJobId) return;

        try {
            // Use our proxy server to avoid CORS issues
            const apiUrl = `/api/v1/crawl/${crawlJobId}`;
            console.log('Using proxy for checking crawl status:', apiUrl);

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            console.log('Crawl status response:', data);

            if (!response.ok) {
                // Check if this is a screenshot-related error
                if (data.error &&
                    (data.error.includes('All scraping engines failed') ||
                        data.error.includes('Internal server error'))) {
                    throw new Error('The Firecrawl API instance encountered an error. If you were trying to use screenshot functionality, it may not be supported by this API instance.');
                } else {
                    throw new Error(data.error || `API returned status ${response.status}`);
                }
            }

            // Update status
            statusText.textContent = data.status || 'Processing';

            if (data.total && data.completed) {
                progressText.textContent = `${data.completed}/${data.total}`;
                const percentage = (data.completed / data.total) * 100;
                progressBar.style.width = `${percentage}%`;
            }

            // If completed, display results
            if (data.status === 'completed') {
                displayCrawlResults(data);

                // Stop checking
                if (crawlCheckInterval) {
                    clearInterval(crawlCheckInterval);
                    crawlCheckInterval = null;
                }
            } else {
                // Continue checking
                if (!crawlCheckInterval) {
                    crawlCheckInterval = setInterval(checkCrawlStatus, 5000);
                }
            }
        } catch (error) {
            showError(`Error checking crawl status: ${error.message}`);

            // Stop checking on error
            if (crawlCheckInterval) {
                clearInterval(crawlCheckInterval);
                crawlCheckInterval = null;
            }
        }
    }

    // Display scrape/extract results
    function displayResults(data) {
        if (!data || !data.data) {
            showError('Invalid response from API');
            return;
        }

        const result = data.data;
        let markdownContent = '';

        // Add links to markdown if they exist
        console.log('Links data:', result.links);

        // Try to handle different possible formats of links data
        if (result.links) {
            markdownContent += '## Links\n\n';

            // Case 1: Array of link objects with href/text properties
            if (Array.isArray(result.links)) {
                result.links.forEach(link => {
                    if (typeof link === 'object') {
                        if (link.href) {
                            const linkText = link.text || link.href;
                            markdownContent += `- [${linkText}](${link.href})\n`;
                        } else if (link.url) {
                            const linkText = link.title || link.text || link.url;
                            markdownContent += `- [${linkText}](${link.url})\n`;
                        }
                    } else if (typeof link === 'string') {
                        markdownContent += `- [${link}](${link})\n`;
                    }
                });
            }
            // Case 2: Object with URLs as keys or values
            else if (typeof result.links === 'object') {
                Object.entries(result.links).forEach(([key, value]) => {
                    if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'))) {
                        markdownContent += `- [${key}](${value})\n`;
                    } else if (typeof key === 'string' && (key.startsWith('http') || key.startsWith('/'))) {
                        const linkText = value || key;
                        markdownContent += `- [${linkText}](${key})\n`;
                    }
                });
            }

            markdownContent += '\n\n';
        }

        // Add original markdown content if it exists
        if (result.markdown) {
            markdownContent += result.markdown;
        }

        // Display markdown if we have any content
        if (markdownContent) {
            document.getElementById('markdown-preview').innerHTML = marked.parse(markdownContent);
            switchTab('markdown');
        }

        // Display JSON
        document.getElementById('json-preview').innerHTML = hljs.highlight('json', JSON.stringify(result, null, 2)).value;

        // Display screenshot
        if (result.screenshot) {
            const img = document.createElement('img');
            img.src = result.screenshot;
            img.alt = 'Screenshot';
            document.getElementById('screenshot-preview').innerHTML = '';
            document.getElementById('screenshot-preview').appendChild(img);
        } else if (result.actions && result.actions.screenshots && result.actions.screenshots.length > 0) {
            const img = document.createElement('img');
            img.src = result.actions.screenshots[0];
            img.alt = 'Screenshot';
            document.getElementById('screenshot-preview').innerHTML = '';
            document.getElementById('screenshot-preview').appendChild(img);
        }

        // If no markdown content but has json extraction, switch to JSON tab
        if (!markdownContent && result.json) {
            switchTab('json');
        }
    }

    // Display crawl results
    function displayCrawlResults(data) {
        if (!data || !data.data || !Array.isArray(data.data)) {
            showError('Invalid crawl results from API');
            return;
        }

        // Combine all markdown
        let combinedMarkdown = '';
        let combinedJson = [];
        let allLinks = [];

        // First collect all links from all pages
        console.log('Crawl data for links:', data.data);

        data.data.forEach(item => {
            const sourceURL = item.metadata?.sourceURL || 'Unknown URL';
            console.log(`Processing links for ${sourceURL}:`, item.links);

            // Case 1: Array of link objects
            if (item.links && Array.isArray(item.links)) {
                item.links.forEach(link => {
                    if (typeof link === 'object') {
                        if (link.href) {
                            allLinks.push({
                                href: link.href,
                                text: link.text || link.href,
                                sourceURL
                            });
                        } else if (link.url) {
                            allLinks.push({
                                href: link.url,
                                text: link.title || link.text || link.url,
                                sourceURL
                            });
                        }
                    } else if (typeof link === 'string') {
                        allLinks.push({
                            href: link,
                            text: link,
                            sourceURL
                        });
                    }
                });
            }
            // Case 2: Object with URLs as keys or values
            else if (item.links && typeof item.links === 'object') {
                Object.entries(item.links).forEach(([key, value]) => {
                    if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'))) {
                        allLinks.push({
                            href: value,
                            text: key,
                            sourceURL
                        });
                    } else if (typeof key === 'string' && (key.startsWith('http') || key.startsWith('/'))) {
                        allLinks.push({
                            href: key,
                            text: value || key,
                            sourceURL
                        });
                    }
                });
            }
        });

        // Add links section at the top if we have any
        if (allLinks.length > 0) {
            console.log('All collected links:', allLinks);
            combinedMarkdown += '## All Links\n\n';
            allLinks.forEach(link => {
                combinedMarkdown += `- [${link.text}](${link.href}) - from [${link.sourceURL}](${link.sourceURL})\n`;
            });
            combinedMarkdown += '\n\n---\n\n';
        }

        // Add content from each page
        data.data.forEach((item, index) => {
            if (item.markdown) {
                combinedMarkdown += `## Page ${index + 1}: ${item.metadata?.title || 'Untitled'}\n\n`;
                combinedMarkdown += `URL: ${item.metadata?.sourceURL || 'Unknown URL'}\n\n`;
                combinedMarkdown += item.markdown;
                combinedMarkdown += '\n\n---\n\n';
            }

            combinedJson.push({
                url: item.metadata?.sourceURL || 'Unknown URL',
                title: item.metadata?.title || 'Untitled',
                data: item
            });
        });

        // Display markdown
        if (combinedMarkdown) {
            document.getElementById('markdown-preview').innerHTML = marked.parse(combinedMarkdown);
            switchTab('markdown');
        }

        // Display JSON
        document.getElementById('json-preview').innerHTML = hljs.highlight('json', JSON.stringify(combinedJson, null, 2)).value;

        // If no markdown, switch to JSON tab
        if (!combinedMarkdown) {
            switchTab('json');
        }
    }

    // Show/hide loading indicator
    function showLoading(show) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }

    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }
});
