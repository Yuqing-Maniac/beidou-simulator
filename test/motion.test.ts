import assert from "node:assert/strict";
import test from "node:test";
import { applySystemTime, checksumOf, decodeSentence, encodeSentence, gpsWeekTimeFromUtc } from "../src/gpchc.ts";
import { formatTrackTokens, metersToLatLon, sampleTrack } from "../src/track.ts";

test("longitude folds into the closed range when a line crosses the antimeridian", () => {
  const sample = sampleTrack(
    { kind: "line", lat: 10, lon: 179.999, headingDeg: 90, speedMps: 200, radiusM: 1 },
    20,
  );
  assert.ok(sample.lon <= 180 && sample.lon >= -180, String(sample.lon));
  assert.ok(sample.lon < 0, String(sample.lon));
  assert.ok(sample.ve > 0);
});

test("a drawn path across the antimeridian follows the short arc east", () => {
  const spec = {
    kind: "path" as const,
    speedMps: 10,
    loop: false,
    points: [
      { lat: 0, lon: 179.99 },
      { lat: 0, lon: -179.99 },
    ],
  };
  const sample = sampleTrack(spec, 1);
  assert.ok(sample.lon > 179.99 || sample.lon < -179.99, String(sample.lon));
  assert.ok(Math.abs(sample.lon) <= 180);
  assert.ok(Math.abs(sample.headingDeg - 90) < 1, String(sample.headingDeg));
  assert.ok(sample.ve > 0, String(sample.ve));
});

test("a later segment across the antimeridian keeps the short-arc heading", () => {
  const spec = {
    kind: "path" as const,
    speedMps: 100,
    loop: false,
    points: [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 179 },
      { lat: 0, lon: -179 },
    ],
  };
  const leg = Math.hypot(179 * 111320, 0);
  const sample = sampleTrack(spec, leg / 100 + 2);
  assert.ok(sample.lon > 179 || sample.lon < -179, String(sample.lon));
  assert.ok(Math.abs(sample.headingDeg - 90) < 1, String(sample.headingDeg));
  assert.ok(sample.ve > 0, String(sample.ve));
});

test("a high-latitude straight line matches east and north speed", () => {
  const spec = { kind: "line" as const, lat: 89, lon: 10, headingDeg: 45, speedMps: 50, radiusM: 1 };
  const sample = sampleTrack(spec, 400);
  const next = sampleTrack(spec, 400.1);
  const mid = ((sample.lat + next.lat) / 2) * Math.PI / 180;
  const vn = ((next.lat - sample.lat) / 0.1) * 111320;
  const ve = ((next.lon - sample.lon) / 0.1) * 111320 * Math.cos(mid);
  assert.ok(Math.abs(sample.lat) <= 90 && Math.abs(sample.lon) <= 180);
  assert.ok(Math.abs(ve - sample.ve) < 0.05, `${ve} vs ${sample.ve}`);
  assert.ok(Math.abs(vn - sample.vn) < 0.05, `${vn} vs ${sample.vn}`);
});

test("east of the pole stays a legal coordinate", () => {
  const pole = metersToLatLon({ lat: 90, lon: 12 }, 10, 0);
  const near = metersToLatLon({ lat: 89.999999, lon: 12 }, 1000, 0);
  for (const point of [pole, near]) {
    assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lon));
    assert.ok(Math.abs(point.lat) <= 90, String(point.lat));
    assert.ok(Math.abs(point.lon) <= 180, String(point.lon));
  }
  assert.ok(Math.abs(pole.lon - 12) < 1e-6, String(pole.lon));
});

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

import { datasetPosition } from '../src/dataset-motion.ts';
import { DATASETS } from '../src/datasets.ts';
test('standard dataset positions follow original ENU velocities without changing protocol state',()=>{
 const tokens={...DATASETS.find(d=>d.id==='slow')!.tokens};const original={...tokens};
 const p=datasetPosition(tokens,10)!;assert.ok(Number(p.lat)>Number(tokens.lat));assert.ok(Number(p.lon)>Number(tokens.lon));assert.deepEqual(tokens,original);
 const n=(Number(p.lat)-Number(tokens.lat))*111320;assert.ok(Math.abs(n-26)<.002);
 const reverse=DATASETS.find(d=>d.id==='reverse')!.tokens;assert.ok(Number(datasetPosition(reverse,10)!.lat)<Number(reverse.lat));
 const stationary=DATASETS.find(d=>d.id==='static-rtk')!.tokens;assert.deepEqual(datasetPosition(stationary,100),{lat:stationary.lat,lon:stationary.lon});
 assert.equal(datasetPosition(DATASETS.find(d=>d.id==='fault')!.tokens,10),null);
});
test('official sentence is unchanged at motion start and very slow motion retains eight decimals',()=>{
 const tokens=DATASETS[0].tokens;assert.deepEqual(datasetPosition(tokens,0),{lat:tokens.lat,lon:tokens.lon});
 const p=datasetPosition(tokens,60)!;assert.notEqual(p.lat,tokens.lat);assert.match(p.lat,/^-?\d+\.\d{8}$/);
 const edge={...tokens,lon:'179.99999999',ve:'10',vn:'0'};assert.ok(Math.abs(Number(datasetPosition(edge,100)!.lon))<=180);
});

import { applyDistanceScale, latLonToMeters, motionButtonEffect, sampleDynamics } from "../src/track.ts";

test("2× distance scale doubles figure-eight speed, acceleration and size, and 1× restores the base", () => {
  const base = { kind: "eight" as const, lat: 31.15960455, lon: 121.1784799, headingDeg: 15, speedMps: 10, radiusM: 80 };
  const doubled = applyDistanceScale(base, 2, 2);
  const restored = applyDistanceScale(base, 2, 1);
  assert.equal(doubled.spec.kind, "eight");
  if (doubled.spec.kind === "path" || restored.spec.kind === "path") assert.fail("expected a radius track");
  assert.equal(doubled.spec.lat, base.lat);
  assert.equal(doubled.spec.lon, base.lon);
  assert.equal(doubled.spec.headingDeg, base.headingDeg);
  assert.equal(doubled.spec.speedMps, 20);
  assert.equal(doubled.spec.radiusM, 160);
  assert.equal(doubled.acceleration, 4);
  assert.deepEqual(restored.spec, base);
  assert.equal(restored.acceleration, 2);
  assert.equal(base.speedMps, 10);
  assert.equal(base.radiusM, 80);
  for (const bad of [0, -2, Number.NaN]) {
    const ignored = applyDistanceScale(base, 2, bad);
    assert.deepEqual(ignored.spec, base);
    assert.equal(ignored.acceleration, 2);
  }
  const plain = sampleDynamics(base, 12, 2);
  const fast = sampleDynamics(doubled.spec, 12, doubled.acceleration);
  assert.ok(Math.abs(fast.v2d - 20) < 1e-6);
  assert.ok(Math.abs(plain.v2d - 10) < 1e-6);
  assert.ok(Math.abs(fast.headingDeg - plain.headingDeg) < 1e-4);
  const near = latLonToMeters(base, plain);
  const far = latLonToMeters(base, fast);
  assert.ok(Math.abs(Math.hypot(far.east, far.north) - 2 * Math.hypot(near.east, near.north)) < 0.05);
  assert.ok(Math.abs(fast.ax - 2 * plain.ax) < 1e-6);
  const rampPlain = sampleDynamics(base, 1, 2);
  const rampFast = sampleDynamics(doubled.spec, 1, doubled.acceleration);
  assert.ok(Math.abs(rampFast.v2d - 4) < 1e-6);
  assert.ok(Math.abs(rampFast.ay - 2 * rampPlain.ay) < 1e-6);
});

test("distance scale speeds a drawn path and keeps its waypoints", () => {
  const spec = { kind: "path" as const, speedMps: 5, loop: false, points: [{ lat: 31, lon: 121 }, { lat: 31.001, lon: 121.001 }] };
  const scaled = applyDistanceScale(spec, 1.5, 2);
  assert.equal(scaled.spec.kind, "path");
  if (scaled.spec.kind !== "path") return;
  assert.equal(scaled.spec.speedMps, 10);
  assert.equal(scaled.acceleration, 3);
  assert.deepEqual(scaled.spec.points, spec.points);
});

test("starting motion asks to send, and pausing while sending freezes the sentence", () => {
  assert.equal(motionButtonEffect(false, true), "start-send");
  assert.equal(motionButtonEffect(true, false), "freeze-send");
  assert.equal(motionButtonEffect(true, true), "none");
  assert.equal(motionButtonEffect(false, false), "none");
});

test('periodic stop-go motion has consistent accelerating, cruising, braking and stopped positions', () => {
  const spec = { kind: 'stop-go' as const, lat: 31, lon: 121, headingDeg: 30, speedMps: 10, radiusM: 50 };
  // Four 5-second phases; every 20 seconds advances by 100 metres.
  const speeds = [sampleTrack(spec, 2.5), sampleTrack(spec, 7.5), sampleTrack(spec, 12.5), sampleTrack(spec, 17.5)];
  assert.deepEqual(speeds.map(p => p.v2d), [5, 10, 5, 0]);
  assert.deepEqual(speeds.map(p => p.forwardAcceleration), [2, 0, -2, 0]);
  assert.deepEqual(sampleTrack(spec, 16), sampleTrack(spec, 19));
  for (const t of [2.5, 7.5, 12.5]) {
    const p = sampleTrack(spec, t), q = sampleTrack(spec, t + .001);
    const delta = latLonToMeters(p, q);
    assert.ok(Math.abs(delta.east / .001 - p.ve) < .01);
    assert.ok(Math.abs(delta.north / .001 - p.vn) < .01);
    assert.equal(p.gyroZ, 0);
  }
  const cycle = sampleTrack(spec, 20), delta = latLonToMeters(spec, cycle);
  assert.ok(Math.abs(Math.hypot(delta.east, delta.north) - 100) < .01);
  assert.equal(sampleTrack(spec, 22.5).v2d, sampleTrack(spec, 2.5).v2d);
});

test('sinusoidal weaving has repeatable position, coherent tangent velocity and signed yaw rate', () => {
  const spec = { kind: 'slalom' as const, lat: 31, lon: 121, headingDeg: 20, speedMps: 8, radiusM: 40 };
  const cycle = 2 * Math.PI * spec.radiusM / spec.speedMps;
  for (const t of [0, 2, 8, 16, 24]) {
    const p = sampleTrack(spec, t), q = sampleTrack(spec, t + .001);
    const delta = latLonToMeters(p, q);
    assert.ok(Math.abs(delta.east / .001 - p.ve) < .01);
    assert.ok(Math.abs(delta.north / .001 - p.vn) < .01);
    const headingChange = ((q.headingDeg - p.headingDeg + 540) % 360) - 180;
    assert.ok(Math.abs(headingChange / .001 - p.gyroZ) < .002);
    assert.ok(Math.abs(p.v2d - Math.hypot(p.ve, p.vn)) < 1e-8);
  }
  assert.ok(sampleTrack(spec, 0).gyroZ > 0);
  assert.ok(sampleTrack(spec, cycle / 2).gyroZ < 0);
  const start = sampleTrack(spec, 0), end = sampleTrack(spec, cycle);
  assert.ok(Math.abs(end.headingDeg - start.headingDeg) < 1e-6);
  const delta = latLonToMeters(spec, end), distance = spec.speedMps * cycle;
  assert.ok(Math.abs(delta.east - Math.sin(spec.headingDeg * Math.PI / 180) * distance) < 1e-6);
  assert.ok(Math.abs(delta.north - Math.cos(spec.headingDeg * Math.PI / 180) * distance) < 1e-6);
});

test('new periodic models keep actual velocity and acceleration consistent during startup', () => {
  for (const kind of ['stop-go', 'slalom'] as const) {
    const spec = { kind, lat: 31, lon: 121, headingDeg: 15, speedMps: 8, radiusM: 40 };
    for (const t of [1, 3, 7, 12, 18]) {
      const p = sampleDynamics(spec, t, 2), q = sampleDynamics(spec, t + .001, 2);
      const delta = latLonToMeters(p, q);
      assert.ok(Math.abs(delta.east / .001 - p.ve) < .01, `${kind} east @ ${t}`);
      assert.ok(Math.abs(delta.north / .001 - p.vn) < .01, `${kind} north @ ${t}`);
      assert.ok(Math.abs((q.v2d - p.v2d) / .001 - p.ay * 9.80665) < .01, `${kind} forward acceleration @ ${t}`);
      assert.ok(Number.isFinite(p.pitch) && Number.isFinite(p.roll));
    }
  }
});
