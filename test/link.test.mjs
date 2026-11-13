import assert from "node:assert/strict";
import dgram from "node:dgram";
import net from "node:net";
import test from "node:test";
import { createSession, defaultIface } from "../electron/multicast.cjs";

const PAYLOAD = "GPCHC,2396,372388.00,105.30,-0.28,0.46";
const SENTENCE = `$${PAYLOAD}*${xor(PAYLOAD)}\r\n`;

function xor(payload) {
  let x = 0;
  for (const ch of payload) x ^= ch.charCodeAt(0);
  return x.toString(16).toUpperCase().padStart(2, "0");
}

function waitFor(pred, ms = 1500) {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (pred()) resolve();
      else if (Date.now() > deadline) reject(new Error("timeout"));
      else setTimeout(tick, 20);
    };
    tick();
  });
}

test("udp and tcp carry the same sentence, and each switch sends only that path", async () => {
  const iface = defaultIface();
  let client;
  let server;
  let outsider;
  let session;
  session = createSession();
  const udp = [];
  session.onPacket((packet) => {
    if (packet.channel === "udp" && packet.sentence) udp.push(packet.sentence);
  });
  await session.listen({
    host: "224.100.100.1",
    port: 16020,
    iface,
    udpEnabled: true,
    tcpEnabled: true,
    tcpMode: "server",
    tcpPort: 16021,
  });
  const tcpBuf = { text: "" };
  client = net.connect({ host: iface, port: 16021, localAddress: iface });
  await new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("error", reject);
  });
  client.on("data", (chunk) => {
    tcpBuf.text += chunk.toString("latin1");
  });
  await waitFor(() => session.config && true);
  await new Promise((r) => setTimeout(r, 50));
  const both = await session.send(SENTENCE);
  assert.deepEqual(both.channels.sort(), ["tcp", "udp"]);
  await waitFor(() => udp.includes(SENTENCE) && tcpBuf.text.includes(SENTENCE));
  assert.equal(tcpBuf.text, SENTENCE);
  assert.equal(udp.find((s) => s === SENTENCE), SENTENCE);

  client.destroy();
  await session.listen({
    host: "224.100.100.1",
    port: 16020,
    iface,
    udpEnabled: true,
    tcpEnabled: false,
  });
  const quiet = { text: "", connections: 0 };
  server = net.createServer((socket) => {
    quiet.connections += 1;
    socket.on("data", (chunk) => {
      quiet.text += chunk.toString("latin1");
    });
  });
  await new Promise((resolve) => server.listen(16022, iface, resolve));
  udp.length = 0;
  await session.send(SENTENCE);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(quiet.connections, 0);
  assert.equal(quiet.text, "");
  assert.equal(udp.includes(SENTENCE), true);

  outsider = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const udpHits = [];
  outsider.on("message", (msg) => udpHits.push(msg.toString("latin1")));
  await new Promise((resolve, reject) => outsider.bind(16023, () => {
    try {
      outsider.addMembership("224.100.100.1", iface);
      resolve();
    } catch (err) {
      reject(err);
    }
  }));
  await session.listen({
    host: "224.100.100.1",
    port: 16023,
    iface,
    udpEnabled: false,
    tcpEnabled: true,
    tcpMode: "client",
    tcpHost: iface,
    tcpPort: 16022,
  });
  await new Promise((r) => setTimeout(r, 40));
  const tcpOnly = await session.send(SENTENCE);
  assert.deepEqual(tcpOnly.channels, ["tcp"]);
  await waitFor(() => quiet.text.includes(SENTENCE));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(udpHits.includes(SENTENCE), false);
  assert.equal(quiet.text, SENTENCE);

  session.close();
  client.destroy();
  server.close();
  outsider.close();
});

test("tcp alone reports not sent after the peer drops, and does not reconnect", async () => {
  const iface = defaultIface();
  const session = createSession();
  let sock;
  const server = net.createServer((socket) => {
    sock = socket;
  });
  await new Promise((resolve) => server.listen(16034, iface, resolve));
  await session.listen({
    iface,
    udpEnabled: false,
    unicastEnabled: false,
    tcpEnabled: true,
    tcpMode: "client",
    tcpHost: iface,
    tcpPort: 16034,
  });
  const live = await session.send(SENTENCE);
  assert.equal(live.ok, true);
  assert.deepEqual(live.channels, ["tcp"]);
  sock.destroy();
  await new Promise((r) => setTimeout(r, 300));
  const dead = await session.send(SENTENCE);
  assert.equal(dead.ok, false);
  assert.deepEqual(dead.channels, []);
  assert.match(dead.error, /TCP 无连接/);
  session.close();
  server.close();
});

test('same interface sends identical multicast and unicast datagrams and disables each independently', async (t) => {
  const iface=defaultIface();const session=createSession();const receiver=dgram.createSocket('udp4');
  t.after(()=>{session.close();receiver.close();});
  await new Promise(r=>receiver.bind(0,iface,r));
  const unicast=[];receiver.on('message',(msg,remote)=>unicast.push({text:msg.toString('latin1'),from:remote.address}));
  const multicast=[];session.onPacket(p=>multicast.push(p.sentence));
  await session.listen({iface,host:'224.100.100.1',port:16030,udpEnabled:true,unicastEnabled:true,unicastHost:iface,unicastPort:receiver.address().port});
  const both=await session.send(SENTENCE);assert.deepEqual(both.channels.sort(),['udp','unicast']);
  await waitFor(()=>unicast.length===1&&multicast.includes(SENTENCE));assert.equal(unicast[0].text,SENTENCE);assert.equal(unicast[0].from,iface);
  await session.listen({udpEnabled:false});
  const only=await session.send(SENTENCE);assert.deepEqual(only.channels,['unicast']);await waitFor(()=>unicast.length===2);
  const off=await session.send(SENTENCE,{unicastEnabled:false});assert.equal(off.ok,false);
});

test('two sessions share one multicast port while another UDP application keeps using the interface', async (t) => {
 const iface=defaultIface();const a=createSession(),b=createSession();const external=dgram.createSocket('udp4');
 t.after(()=>{a.close();b.close();external.close();});
 await new Promise(r=>external.bind(0,iface,r));
 const seenA=[],seenB=[],outside=[];a.onPacket(p=>seenA.push(p.sentence));b.onPacket(p=>seenB.push(p.sentence));external.on('message',p=>outside.push(p.toString('latin1')));
 const cfg={iface,host:'224.100.100.2',port:16040,udpEnabled:true};
 await a.listen(cfg);await b.listen(cfg);
 await a.send(SENTENCE,{unicastEnabled:true,unicastHost:iface,unicastPort:external.address().port});
 await waitFor(()=>seenA.includes(SENTENCE)&&seenB.includes(SENTENCE)&&outside.includes(SENTENCE));
 assert.equal(external.address().address,iface);
});
