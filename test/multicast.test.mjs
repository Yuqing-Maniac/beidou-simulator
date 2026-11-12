import assert from "node:assert/strict";
import test from "node:test";
import { createSession, defaultIface, listNics } from "../electron/multicast.cjs";

test("multicast loopback on 224.100.100.1 delivers the sent sentence", async () => {
  const nics = listNics();
  assert.ok(nics.length > 0);
  const iface = defaultIface();
  assert.ok(iface);
  const session = createSession();
  const port = 6020;
  const received = [];
  session.onPacket((packet) => {
    if (packet.sentence) received.push(packet);
  });
  await session.listen({ host: "224.100.100.1", port, iface });
  const sentence = "$GPCHC,2396,372388.00,105.30*4A\r\n";
  const sent = await session.send(sentence, { host: "224.100.100.1", port, iface });
  assert.equal(sent.ok, true);
  const deadline = Date.now() + 2000;
  while (received.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 30));
  }
  session.close();
  assert.equal(received.length > 0, true, `no loopback packet on ${iface}`);
  assert.equal(received[0].sentence, sentence);
  assert.equal(received[0].port > 0, true);
});
