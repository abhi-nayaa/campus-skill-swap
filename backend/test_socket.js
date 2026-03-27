const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => res.send('Socket.io Test'));

io.on('connection', (socket) => {
    console.log('A user connected');
});

server.listen(5001, () => {
    console.log('Socket.io server running on port 5001');
});
