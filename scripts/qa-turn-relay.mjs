import net from "node:net";
import dgram from "node:dgram";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Optional QA-only dependency installed outside the application; never exposed publicly.
const Turn = require(process.env.QA_TURN_MODULE || "node-turn");
const server = new Turn({
  listeningPort: 3479,
  listeningIps: ["127.0.0.1"],
  relayIps: ["127.0.0.1"],
  authMech: "long-term",
  credentials: { "gstudy-local-qa": "local-test-only" },
  realm: "gstudy-local-qa",
  minPort: 41000,
  maxPort: 41100,
  debugLevel: "NONE",
});
server.start();
const bridge = net.createServer((socket) => {
  const udp = dgram.createSocket("udp4");
  let buffer = Buffer.alloc(0);
  udp.bind(0, "127.0.0.1");
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 1024 * 1024) {
      socket.destroy();
      return;
    }
    while (buffer.length >= 4) {
      const channel = (buffer[0] & 0xc0) === 0x40;
      if (!channel && buffer.length < 20) break;
      const length = buffer.readUInt16BE(2) + (channel ? 4 : 20),
        padded = channel ? Math.ceil(length / 4) * 4 : length;
      if (buffer.length < padded) break;
      udp.send(buffer.subarray(0, length), 3479, "127.0.0.1");
      buffer = buffer.subarray(padded);
    }
  });
  udp.on("message", (message) => {
    if (socket.destroyed) return;
    if ((message[0] & 0xc0) === 0x40) {
      const padded = Buffer.alloc(Math.ceil(message.length / 4) * 4);
      message.copy(padded);
      socket.write(padded);
    } else socket.write(message);
  });
  socket.on("error", () => {});
  udp.on("error", () => {});
  socket.on("close", () => udp.close());
});
bridge.listen(3480, "127.0.0.1", () =>
  console.log("Relay TURN TCP de teste disponível somente em 127.0.0.1:3480"),
);
process.on("SIGTERM", () => {
  bridge.close();
  server.stop();
  process.exit(0);
});
