const dgram = require("node:dgram");
const net = require("node:net");
const os = require("node:os");

const DEFAULT_HOST = "224.100.100.1";
const DEFAULT_PORT = 6020;

function listNics() {
  const nics = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs || []) {
      const family = addr.family;
      if (family !== "IPv4" && family !== 4) continue;
      nics.push({ name, address: addr.address, internal: Boolean(addr.internal) });
    }
  }
  return nics;
}

function defaultIface() {
  const nics = listNics();
  return (nics.find((n) => !n.internal) || nics[0] || { address: "" }).address;
}

function createSession() {
  let recv = null;
  const listeners = new Set();
  const statusListeners = new Set();
  const config = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    iface: defaultIface(),
    udpEnabled: true,
    unicastEnabled: false,
    unicastHost: "127.0.0.1",
    unicastPort: 6022,
    tcpEnabled: false,
    tcpMode: "client",
    tcpHost: "127.0.0.1",
    tcpPort: 6021,
  };
  let tcpServer = null;
  let tcpClient = null;
  const tcpPeers = new Set();
  let tcpStatus = "TCP 关";

  function emit(packet) {
    for (const fn of listeners) fn(packet);
  }

  function emitStatus() {
    const snap = {
      udp: `${config.udpEnabled ? `组播 ${config.host}:${config.port}` : "组播关"} · ${config.unicastEnabled ? `单播 ${config.unicastHost}:${config.unicastPort}` : "单播关"}`,
      tcp: tcpStatus,
      udpEnabled: config.udpEnabled,
      tcpEnabled: config.tcpEnabled,
      tcpMode: config.tcpMode,
    };
    for (const fn of statusListeners) fn(snap);
    return snap;
  }

  function takeConfig(next = {}) {
    if (next.host) config.host = String(next.host);
    if (next.port) config.port = Number(next.port);
    if (typeof next.iface === "string") config.iface = next.iface;
    if (typeof next.unicastEnabled === "boolean") config.unicastEnabled = next.unicastEnabled;
    if (next.unicastHost) config.unicastHost = String(next.unicastHost);
    if (next.unicastPort) config.unicastPort = Number(next.unicastPort);
    if (typeof next.udpEnabled === "boolean") config.udpEnabled = next.udpEnabled;
    if (typeof next.tcpEnabled === "boolean") config.tcpEnabled = next.tcpEnabled;
    if (next.tcpMode === "client" || next.tcpMode === "server") config.tcpMode = next.tcpMode;
    if (next.tcpHost) config.tcpHost = String(next.tcpHost);
    if (next.tcpPort) config.tcpPort = Number(next.tcpPort);
  }

  function dropSocket(socket) {
    tcpPeers.delete(socket);
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }

  function attachTcp(socket, remote) {
    tcpPeers.add(socket);
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("latin1");
      let idx = buf.indexOf("\n");
      while (idx >= 0) {
        const line = buf.slice(0, idx + 1);
        buf = buf.slice(idx + 1);
        const sentence = line.endsWith("\r\n") ? line : line.replace(/\n$/, "\r\n");
        emit({ sentence, from: remote.address, port: remote.port, channel: "tcp" });
        idx = buf.indexOf("\n");
      }
    });
    socket.on("close", () => {
      tcpPeers.delete(socket);
      if (config.tcpEnabled && config.tcpMode === "server") {
        tcpStatus = `TCP 服务端 ${config.iface || "0.0.0.0"}:${config.tcpPort}，${tcpPeers.size} 个连接`;
      } else if (config.tcpEnabled) {
        tcpStatus = "TCP 已断开";
      }
      emitStatus();
    });
    socket.on("error", (err) => {
      tcpStatus = `TCP ${err.message}`;
      emitStatus();
    });
  }

  function closeTcp() {
    for (const socket of tcpPeers) dropSocket(socket);
    tcpPeers.clear();
    if (tcpClient) {
      const socket = tcpClient;
      tcpClient = null;
      dropSocket(socket);
    }
    if (tcpServer) {
      const server = tcpServer;
      tcpServer = null;
      server.close();
    }
    tcpStatus = "TCP 关";
  }

  function openTcp() {
    closeTcp();
    if (!config.tcpEnabled) {
      emitStatus();
      return Promise.resolve(emitStatus());
    }
    if (config.tcpMode === "server") {
      return new Promise((resolve, reject) => {
        const server = net.createServer((socket) => {
          const remote = { address: socket.remoteAddress || "", port: socket.remotePort || 0 };
          attachTcp(socket, remote);
          tcpStatus = `TCP 服务端 ${config.iface || "0.0.0.0"}:${config.tcpPort}，${tcpPeers.size} 个连接`;
          emitStatus();
        });
        tcpServer = server;
        server.once("error", (err) => {
          tcpStatus = `TCP ${err.message}`;
          emitStatus();
          reject(err);
        });
        server.listen(config.tcpPort, config.iface || undefined, () => {
          tcpStatus = `TCP 服务端 ${config.iface || "0.0.0.0"}:${config.tcpPort}，0 个连接`;
          resolve(emitStatus());
        });
      });
    }
    return new Promise((resolve, reject) => {
      const socket = net.connect({
        host: config.tcpHost,
        port: config.tcpPort,
        localAddress: config.iface || undefined,
      });
      tcpClient = socket;
      tcpStatus = `TCP 连接中 ${config.tcpHost}:${config.tcpPort}`;
      emitStatus();
      const fail = (err) => {
        tcpStatus = `TCP ${err.message}`;
        emitStatus();
        reject(err);
      };
      socket.once("error", fail);
      socket.once("connect", () => {
        socket.removeListener("error", fail);
        const remote = { address: socket.remoteAddress || config.tcpHost, port: socket.remotePort || config.tcpPort };
        attachTcp(socket, remote);
        tcpStatus = `TCP 已连接 ${config.tcpHost}:${config.tcpPort}`;
        resolve(emitStatus());
      });
    });
  }

  function closeRecv() {
    if (!recv) return;
    const socket = recv;
    recv = null;
    try {
      socket.close();
    } catch {
      /* already closed */
    }
  }

  function listenUdp() {
    closeRecv();
    if (!config.udpEnabled) return Promise.resolve({ ok: true, udp: false });
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    recv = socket;
      socket.on("message", (msg, rinfo) => {
      emit({
        sentence: msg.toString("latin1"),
        from: rinfo.address,
        port: rinfo.port,
        channel: "udp",
      });
    });
    return new Promise((resolve, reject) => {
      const fail = (err) => {
        if (recv === socket) recv = null;
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        reject(err);
      };
      socket.once("error", fail);
      socket.bind(config.port, () => {
        try {
          socket.setMulticastLoopback(true);
          if (config.iface) socket.addMembership(config.host, config.iface);
          else socket.addMembership(config.host);
          socket.removeListener("error", fail);
          socket.on("error", (err) => emit({ sentence: "", from: "", port: 0, error: err.message }));
          resolve({ ok: true, host: config.host, port: config.port, iface: config.iface, udp: true });
        } catch (err) {
          fail(err);
        }
      });
    });
  }

  function listen(next = {}) {
    takeConfig(next);
    return listenUdp().then((udp) => openTcp().then((tcp) => ({ ...udp, ...tcp, ok: true })).catch((err) => {
      tcpStatus = `TCP ${err.message}`;
      return { ...udp, ok: config.udpEnabled || config.unicastEnabled, tcpError: err.message, ...emitStatus() };
    }));
  }

  function udpSend(payload, unicast = false) {
    const host = unicast ? config.unicastHost : config.host;
    const port = unicast ? config.unicastPort : config.port;
    const iface = config.iface;
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      const finish = (err) => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve({ host, port, iface });
      };
      socket.once("error", finish);
      socket.bind(0, iface || undefined, () => {
        try {
          if (!unicast) {
            socket.setMulticastLoopback(true);
            if (iface) socket.setMulticastInterface(iface);
          }
          socket.send(payload, port, host, finish);
        } catch (err) {
          finish(err);
        }
      });
    });
  }

  function send(sentence, override = {}) {
    takeConfig(override);
    const payload = Buffer.from(sentence, "latin1");
    const report = {
      ok: true,
      bytes: payload.length,
      host: config.host,
      port: config.port,
      iface: config.iface,
      channels: [],
    };
    const jobs = [];
    if (config.udpEnabled) jobs.push(udpSend(payload).then(() => report.channels.push("udp")));
    if (config.unicastEnabled) jobs.push(udpSend(payload, true).then(() => report.channels.push("unicast")));
    if (config.tcpEnabled) {
      if (tcpPeers.size === 0) report.tcpError = "TCP 无连接";
      else {
        for (const socket of tcpPeers) socket.write(payload);
        report.channels.push("tcp");
      }
    }
    if (!config.udpEnabled && !config.unicastEnabled && !config.tcpEnabled) {
      report.ok = false;
      report.error = "组播、单播与 TCP 都未打开";
    }
    return Promise.all(jobs).then(() => report);
  }

  function onPacket(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function onStatus(fn) {
    statusListeners.add(fn);
    return () => statusListeners.delete(fn);
  }

  function close() {
    closeRecv();
    closeTcp();
    listeners.clear();
    statusListeners.clear();
  }

  return { listen, send, onPacket, onStatus, close, config };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  listNics,
  defaultIface,
  createSession,
};
