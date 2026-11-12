import assert from "node:assert/strict";
import test from "node:test";
import { applySystemTime, checksumOf, decodeSentence, encodeSentence, gpsWeekTimeFromUtc } from "../src/gpchc.ts";
import { formatTrackTokens, sampleTrack } from "../src/track.ts";

test("gps week and seconds of week use UTC plus 18 leap seconds", () => {
  const utc = Date.UTC(2025, 11, 11, 7, 26, 10);
  const stamp = gpsWeekTimeFromUtc(utc);
  assert.equal(stamp.week, "2396");
  assert.equal(stamp.sow, "372388.00");
  const frac = gpsWeekTimeFromUtc(utc + 250);
  assert.equal(frac.sow, "372388.25");
});

test("system time stays off the hand-entered week and seconds", () => {
  const tokens = { week: "1000", sow: "1.00" };
  assert.deepEqual(applySystemTime(tokens, false, Date.UTC(2025, 11, 11, 7, 26, 10)), tokens);
  const on = applySystemTime(tokens, true, Date.UTC(2025, 11, 11, 7, 26, 10));
  assert.equal(on.week, "2396");
  assert.equal(on.sow, "372388.00");
  assert.equal(tokens.week, "1000");
});

test("line cruise moves north at the set speed", () => {
  const sample = sampleTrack({ kind: "line", lat: 31, lon: 121, headingDeg: 0, speedMps: 10, radiusM: 1 }, 2);
  assert.ok(Math.abs(sample.lat - (31 + 20 / 111320)) < 1e-9);
  assert.ok(Math.abs(sample.lon - 121) < 1e-9);
  assert.ok(Math.abs(sample.headingDeg) < 1e-6);
  assert.ok(Math.abs(sample.vn - 10) < 1e-6);
  assert.ok(Math.abs(sample.ve) < 1e-6);
  assert.ok(Math.abs(sample.v2d - 10) < 1e-6);
  assert.equal(sample.gyroZ, 0);
});

test("circle follows the tangent and a constant heading rate", () => {
  const spec = { kind: "circle" as const, lat: 31, lon: 121, headingDeg: 90, speedMps: 10, radiusM: 20 };
  const start = sampleTrack(spec, 0);
  assert.ok(Math.abs(start.lat - 31) < 1e-9);
  assert.ok(Math.abs(start.headingDeg - 90) < 1e-6);
  const t = (Math.PI * spec.radiusM) / (2 * spec.speedMps);
  const quarter = sampleTrack(spec, t);
  assert.ok(Math.abs(quarter.headingDeg - 180) < 1e-6);
  assert.ok(Math.abs(quarter.v2d - 10) < 1e-6);
  assert.ok(Math.abs(quarter.ve - 10 * Math.sin((180 * Math.PI) / 180)) < 1e-6);
  assert.ok(Math.abs(quarter.vn - 10 * Math.cos(Math.PI)) < 1e-6);
  const rate = ((spec.speedMps / spec.radiusM) * 180) / Math.PI;
  assert.ok(Math.abs(quarter.gyroZ - rate) < 1e-6);
});

test("figure eight returns to the start after one loop and reverses the turn", () => {
  const spec = { kind: "eight" as const, lat: 31, lon: 121, headingDeg: 0, speedMps: 8, radiusM: 25 };
  const lap = (2 * Math.PI * spec.radiusM) / spec.speedMps;
  const back = sampleTrack(spec, lap);
  assert.ok(Math.abs(back.lat - 31) < 1e-6);
  assert.ok(Math.abs(back.lon - 121) < 1e-6);
  assert.ok(Math.abs(back.headingDeg) < 1e-4 || Math.abs(back.headingDeg - 360) < 1e-4);
  const next = sampleTrack(spec, lap + 0.2);
  assert.ok(next.gyroZ < 0);
  assert.ok(sampleTrack(spec, 0.2).gyroZ > 0);
  assert.ok(Math.abs(next.v2d - 8) < 1e-6);
});

test("drawn path walks the segment and encodes a valid sentence", () => {
  const spec = {
    kind: "path" as const,
    speedMps: 5,
    loop: true,
    points: [
      { lat: 31, lon: 121 },
      { lat: 31, lon: 121.001 },
    ],
  };
  const sample = sampleTrack(spec, 1);
  assert.ok(sample.lat > 30.999);
  assert.ok(sample.lon > 121);
  assert.ok(Math.abs(sample.headingDeg - 90) < 1);
  assert.ok(sample.ve > 0);
  assert.ok(Math.abs(sample.vn) < 0.2);
  assert.ok(Math.abs(sample.v2d - Math.hypot(sample.ve, sample.vn)) < 1e-6);
  const text = formatTrackTokens(sample);
  const sentence = encodeSentence({
    week: "2396",
    sow: "372388.00",
    heading: text.heading,
    pitch: "0.00",
    roll: "0.00",
    gx: "0.00",
    gy: "0.00",
    gz: text.gz,
    ax: "0.0000",
    ay: "0.0000",
    az: "1.0000",
    lat: text.lat,
    lon: text.lon,
    alt: "51.34",
    ve: text.ve,
    vn: text.vn,
    vu: "0.000",
    v2d: text.v2d,
    nsv1: "28",
    nsv2: "39",
    status: "61",
    age: "0",
    warning: "0000",
  });
  const decoded = decodeSentence(sentence);
  assert.equal(decoded.sumOk, true);
  assert.equal(sentence.endsWith("\r\n"), true);
  assert.equal(decoded.computedSum, checksumOf(decoded.payload));
  assert.equal(text.lat.split(".")[1].length, 8);
  assert.equal(text.lon.split(".")[1].length, 8);
});
