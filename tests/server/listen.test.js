const http = require('http');
const net = require('net');
const { listen } = require('../../src/server/listen');

// Ask the OS for a currently-free loopback port.
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function occupy(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe('listen', () => {
  const held = [];
  afterEach(async () => {
    while (held.length) await closeServer(held.pop());
  });

  test('listens on the requested port when it is free', async () => {
    const port = await freePort();
    const server = http.createServer((req, res) => res.end('ok'));
    const result = await listen(server, { port, bind: '127.0.0.1' });
    expect(result).toEqual({ port });
    expect(server.listening).toBe(true);
    held.push(server);
  });

  test('rejects with a config-pointing message when the port is in use', async () => {
    const port = await freePort();
    held.push(await occupy(port));

    const server = http.createServer();
    await expect(listen(server, { port, bind: '127.0.0.1' })).rejects.toThrow(
      new RegExp(`port ${port} is already in use.*config\\.json`)
    );
    expect(server.listening).toBe(false);
  });

  test('rejects non-EADDRINUSE errors', async () => {
    const port = await freePort();
    const server = http.createServer();
    await expect(listen(server, { port, bind: '203.0.113.7' })).rejects.toThrow();
  });
});
