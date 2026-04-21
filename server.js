const http = require('http');
const ws = require('ws');
const net = require('net');
const url = require('url');
const path = require('path');
const fs = require('fs');

const PUBLIC = path.join(__dirname);
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let pathname = url.parse(req.url).pathname;
  if (pathname === '/') pathname = '/index.html';
  const filepath = path.join(PUBLIC, pathname);
  const ext = path.extname(filepath);
  try {
    const data = fs.readFileSync(filepath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.end(data);
  } catch(e) {
    res.writeHead(404); res.end('404: ' + pathname);
  }
});

function handleWisp(socket) {
  const streams = new Map();
  socket.on('message', (data) => {
    if (!(data instanceof Buffer)) data = Buffer.from(data);
    if (data.length < 1) return;
    const type = data[0];
    if (type === 0x01) {
      if (data.length < 10) return;
      const streamId = data.readUInt32LE(1);
      const port = data.readUInt16BE(6);
      const hostnameLen = data.readUInt16LE(8);
      const hostname = data.slice(10, 10 + hostnameLen).toString();
      const sock = new net.Socket();
      sock.setTimeout(30000);
      streams.set(streamId, sock);
      sock.connect(port, hostname, () => {
        const pkt = Buffer.alloc(5); pkt[0] = 0x02; pkt.writeUInt32LE(streamId, 1);
        try { socket.send(pkt); } catch(e) {}
      });
      sock.on('data', (chunk) => {
        const hdr = Buffer.alloc(5); hdr[0] = 0x03; hdr.writeUInt32LE(streamId, 1);
        try { socket.send(Buffer.concat([hdr, chunk])); } catch(e) {}
      });
      const closeStream = (code) => {
        streams.delete(streamId);
        const pkt = Buffer.alloc(6); pkt[0] = 0x04; pkt.writeUInt32LE(streamId, 1); pkt[5] = code;
        try { socket.send(pkt); } catch(e) {}
      };
      sock.on('close', () => closeStream(0x02));
      sock.on('error', () => closeStream(0x03));
      sock.on('timeout', () => { sock.destroy(); closeStream(0x03); });
    } else if (type === 0x03) {
      if (data.length < 5) return;
      const sock = streams.get(data.readUInt32LE(1));
      if (sock && !sock.destroyed) sock.write(data.slice(5));
    } else if (type === 0x04) {
      if (data.length < 5) return;
      const sock = streams.get(data.readUInt32LE(1));
      if (sock) { sock.destroy(); streams.delete(data.readUInt32LE(1)); }
    }
  });
  const cleanup = () => { streams.forEach(s => s.destroy()); streams.clear(); };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

const wss = new ws.WebSocketServer({ noServer: true });
wss.on('connection', handleWisp);
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/wisp/'))
    wss.handleUpgrade(req, socket, head, (c) => wss.emit('connection', c, req));
  else socket.destroy();
});

const PORT = 8080;
server.listen(PORT, '127.0.0.1', () => {
  console.log('\n  Panther OS');
  console.log('  ─────────────────────────────');
  console.log('  Open in Chrome: http://localhost:' + PORT);
  console.log('  Keep this window open.\n');
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? 'start chrome' :
              process.platform === 'darwin' ? 'open -a "Google Chrome"' : 'xdg-open';
  exec(cmd + ' http://localhost:' + PORT, ()=>{});
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.log('  Port busy — open http://localhost:8080 in Chrome');
  else console.error(e.message);
});
