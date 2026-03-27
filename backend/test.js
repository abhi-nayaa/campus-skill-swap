const http = require('http');
const server = http.createServer((req, res) => {
    res.end('Hello World');
});
server.listen(5000, () => {
    console.log('Test server running on port 5000');
});
