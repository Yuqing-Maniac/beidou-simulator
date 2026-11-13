import assert from "node:assert/strict";
import test from "node:test";
import { DATASETS } from "../src/datasets.ts";
import {
  OFFICIAL_SENTENCE,
  checksumOf,
  decodeSentence,
  decodeStatus,
  encodeSentence,
  fieldIssues,
  gpsCalendar,
  gpsWeekTimeFromUtc,
  warningMask,
  v2dConsistent,
} from "../src/gpchc.ts";

const OFFICIAL_WIRE = OFFICIAL_SENTENCE + "\r\n";

test("official example encodes byte for byte", () => {
  const sentence = encodeSentence(DATASETS[0].tokens);
  assert.equal(sentence, OFFICIAL_WIRE);
  assert.equal(sentence.slice(-2), "\r\n");
  assert.ok(sentence.includes("*4A"));
});

test("official example round-trips", () => {
  const decoded = decodeSentence(OFFICIAL_WIRE);
  assert.equal(decoded.sumOk, true);
  assert.equal(decoded.computedSum, "4A");
  assert.deepEqual(decoded.issues, []);
  const again = encodeSentence(decoded.tokens);
  assert.equal(again, OFFICIAL_WIRE);
});

test("checksum is the XOR of bytes strictly between $ and *", () => {
  const payload = OFFICIAL_SENTENCE.slice(1, OFFICIAL_SENTENCE.lastIndexOf("*"));
  assert.equal(checksumOf(payload), "4A");
  assert.equal(checksumOf(""), "00");
  assert.notEqual(checksumOf("$" + payload), "4A");
  assert.notEqual(checksumOf(payload + "*"), "4A");
});

test("status 61 and warning 0102", () => {
  const st = decodeStatus("61");
  assert.equal(st.tens, "单点定位不定向");
  assert.equal(st.ones, "卫导模式");
  const mask = warningMask("0102");
  assert.equal(mask, 0x0102);
  assert.equal((mask! & (1 << 1)) !== 0, true);
  assert.equal((mask! & (1 << 8)) !== 0, true);
  assert.equal((mask! & (1 << 0)) !== 0, false);
});

test("a clock before the GPS epoch does not emit a negative week", () => {
  const stamp = gpsWeekTimeFromUtc(Date.UTC(1979, 0, 1));
  assert.equal(stamp.week, "0");
  assert.equal(stamp.sow, "0.00");
  assert.equal(stamp.clamped, true);
  const sentence = encodeSentence({ ...DATASETS[0].tokens, week: stamp.week, sow: stamp.sow });
  const decoded = decodeSentence(sentence);
  assert.equal(decoded.sumOk, true);
  assert.equal(decoded.tokens.week, "0");
  assert.equal(Number(decoded.tokens.week) >= 0, true);
});

test("example GPS week and seconds land on 2025-12-11 07:26:28", () => {
  const cal = gpsCalendar("2396", "372388.00");
  assert.match(cal.gps, /2025-12-11 07:26:28/);
  assert.match(cal.utc, /2025-12-11 07:26:10/);
});

test("happy datasets are in range and V_2D matches Ve and Vn", () => {
  for (const d of DATASETS) {
    if (d.fault) continue;
    const sentence = encodeSentence(d.tokens);
    const decoded = decodeSentence(sentence);
    assert.equal(decoded.sumOk, true, d.name);
    assert.equal(decoded.issues.length, 0, d.name + decoded.issues.join(","));
    for (const [key, token] of Object.entries(d.tokens)) {
      const issues = fieldIssues(key, token);
      assert.equal(issues.length, 0, `${d.name} ${key} ${token} ${issues.map((i) => i.text).join(",")}`);
    }
    const speed = v2dConsistent(d.tokens);
    assert.equal(speed.ok, true, d.name + speed.text);
  }
});

test("fault set is visibly invalid", () => {
  const fault = DATASETS.find((d) => d.fault)!;
  const sentence = encodeSentence(fault.tokens, fault.checksumOverride);
  const decoded = decodeSentence(sentence);
  assert.equal(decoded.sumOk, false);
  assert.ok(fieldIssues("heading", fault.tokens.heading).some((i) => i.text.includes("超出")));
  assert.ok(fieldIssues("lat", fault.tokens.lat).length > 0);
  assert.ok(fieldIssues("warning", fault.tokens.warning).length > 0);
  const missing = decodeSentence(fault.extraSentences![0].sentence);
  assert.ok(missing.issues.some((i) => i.includes("字段数")));
});
