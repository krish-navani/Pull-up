const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // Normalize URL
    let urlPath = req.url === '/' || req.url === '/admin' ? '/index.html' : req.url;
    
    // Remove query strings
    urlPath = urlPath.split('?')[0];

    const filePath = path.join(__dirname, urlPath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Admin Dashboard Server Running!`);
    console.log(`📍 Open in browser: http://localhost:${PORT}/admin`);
    console.log(`\nPress Ctrl+C to stop\n`);
});
