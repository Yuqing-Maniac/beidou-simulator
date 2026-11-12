import { createRequire } from "node:module";
import type { ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const { createSession, listNics } = require("./electron/multicast.cjs") as {
  createSession: () => {
    listen: (cfg: { host?: string; port?: number; iface?: string }) => Promise<unknown>;
    send: (sentence: string, cfg: { host?: string; port?: number; iface?: string }) => Promise<unknown>;
    onPacket: (fn: (packet: unknown) => void) => void;
    onStatus: (fn: (status: unknown) => void) => void;
  };
  listNics: () => unknown;
};

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function udpPlugin() {
  const session = createSession();
  const clients = new Set<ServerResponse>();
  const push = (packet: unknown) => {
    const chunk = `data: ${JSON.stringify(packet)}\n\n`;
    for (const res of clients) res.write(chunk);
  };
  session.onPacket(push);
  session.onStatus((status: unknown) => push({ status }));
  return {
    name: "gpchc-udp",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/nics", (_req, res) => {
        json(res, 200, listNics());
      });
      server.middlewares.use("/api/listen", (req, res) => {
        if (req.method !== "POST") return json(res, 405, { ok: false });
        void readBody(req).then((raw) => session.listen(JSON.parse(raw || "{}"))).then(
          (body) => json(res, 200, body),
          (err) => json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) }),
        );
      });
      server.middlewares.use("/api/send", (req, res) => {
        if (req.method !== "POST") return json(res, 405, { ok: false });
        void readBody(req).then(async (raw) => {
          const body = JSON.parse(raw || "{}") as { sentence?: string; host?: string; port?: number; iface?: string };
          return session.send(body.sentence ?? "", body);
        }).then(
          (body) => json(res, 200, body),
          (err) => json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) }),
        );
      });
      server.middlewares.use("/api/events", (req, res) => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(":\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [udpPlugin()],
  server: { host: "127.0.0.1", port: 43123, strictPort: true },
});
