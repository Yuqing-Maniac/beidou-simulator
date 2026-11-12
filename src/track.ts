/** Local-meter motion for $GPCHC lat/lon/heading/velocity. Gyro Z is heading rate only. */

export type LatLon = { lat: number; lon: number };

export type TrackSample = {
  lat: number;
  lon: number;
  headingDeg: number;
  ve: number;
  vn: number;
  v2d: number;
  gyroZ: number;
};

type Motion = {
  kind: "line" | "circle" | "eight";
  lat: number;
  lon: number;
  headingDeg: number;
  speedMps: number;
  radiusM: number;
};

export type TrackSpec =
  | Motion
  | { kind: "path"; points: LatLon[]; speedMps: number; loop: boolean };

const M_PER_DEG = 111320;

export function metersToLatLon(origin: LatLon, east: number, north: number): LatLon {
  const lat = origin.lat + north / M_PER_DEG;
  const lon = origin.lon + east / (M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lon };
}

export function latLonToMeters(origin: LatLon, point: LatLon): { east: number; north: number } {
  return {
    north: (point.lat - origin.lat) * M_PER_DEG,
    east: (point.lon - origin.lon) * M_PER_DEG * Math.cos((origin.lat * Math.PI) / 180),
  };
}

function wrap360(deg: number): number {
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

function enu(headingDeg: number, forward: number, right: number): { east: number; north: number } {
  const h = (headingDeg * Math.PI) / 180;
  return {
    east: forward * Math.sin(h) + right * Math.cos(h),
    north: forward * Math.cos(h) - right * Math.sin(h),
  };
}

function moving(headingDeg: number, speed: number, lat: number, lon: number, gyroZ: number): TrackSample {
  const h = wrap360(headingDeg);
  const ve = speed * Math.sin((h * Math.PI) / 180);
  const vn = speed * Math.cos((h * Math.PI) / 180);
  return { lat, lon, headingDeg: h, ve, vn, v2d: Math.hypot(ve, vn), gyroZ };
}

function sampleMotion(spec: Motion, t: number): TrackSample {
  const speed = Math.max(0, spec.speedMps);
  const radius = Math.max(0.001, spec.radiusM);
  if (spec.kind === "line") {
    const dist = speed * t;
    const { east, north } = enu(spec.headingDeg, dist, 0);
    const p = metersToLatLon(spec, east, north);
    return moving(spec.headingDeg, speed, p.lat, p.lon, 0);
  }
  const omega = speed / radius;
  if (spec.kind === "circle") {
    const alpha = omega * t;
    const right = radius * (1 - Math.cos(alpha));
    const forward = radius * Math.sin(alpha);
    const { east, north } = enu(spec.headingDeg, forward, right);
    const p = metersToLatLon(spec, east, north);
    const gyroZ = (omega * 180) / Math.PI;
    return moving(spec.headingDeg + (alpha * 180) / Math.PI, speed, p.lat, p.lon, gyroZ);
  }
  const lap = 2 * Math.PI * radius;
  const s = speed * t;
  const which = Math.floor(s / lap) % 2;
  const alpha = (s % lap) / radius;
  const localH = which === 0 ? (alpha * 180) / Math.PI : (-alpha * 180) / Math.PI;
  const right = which === 0 ? radius * (1 - Math.cos(alpha)) : -radius * (1 - Math.cos(alpha));
  const forward = radius * Math.sin(alpha);
  const { east, north } = enu(spec.headingDeg, forward, right);
  const p = metersToLatLon(spec, east, north);
  const gyroZ = (which === 0 ? 1 : -1) * ((omega * 180) / Math.PI);
  return moving(spec.headingDeg + localH, speed, p.lat, p.lon, gyroZ);
}

function samplePath(spec: Extract<TrackSpec, { kind: "path" }>, t: number): TrackSample {
  const pts = spec.points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length === 0) return moving(0, 0, 0, 0, 0);
  if (pts.length === 1) return moving(0, 0, pts[0].lat, pts[0].lon, 0);
  const origin = pts[0];
  const chain = spec.loop ? [...pts, pts[0]] : pts;
  const seg: { a: LatLon; b: LatLon; len: number; east: number; north: number }[] = [];
  let total = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const d = latLonToMeters(origin, chain[i + 1]);
    const a = latLonToMeters(origin, chain[i]);
    const east = d.east - a.east;
    const north = d.north - a.north;
    const len = Math.hypot(east, north);
    if (len < 0.05) continue;
    seg.push({ a: chain[i], b: chain[i + 1], len, east, north });
    total += len;
  }
  if (seg.length === 0 || total === 0) return moving(0, 0, origin.lat, origin.lon, 0);
  const speed = Math.max(0, spec.speedMps);
  let dist = speed * t;
  if (!spec.loop && dist >= total) {
    const last = seg[seg.length - 1];
    const heading = (Math.atan2(last.east, last.north) * 180) / Math.PI;
    return moving(heading, 0, last.b.lat, last.b.lon, 0);
  }
  if (spec.loop) dist = dist % total;
  let cursor = dist;
  let pick = seg[0];
  for (const s of seg) {
    pick = s;
    if (cursor <= s.len) break;
    cursor -= s.len;
  }
  const u = Math.min(1, cursor / pick.len);
  const lat = pick.a.lat + (pick.b.lat - pick.a.lat) * u;
  const lon = pick.a.lon + (pick.b.lon - pick.a.lon) * u;
  const heading = (Math.atan2(pick.east, pick.north) * 180) / Math.PI;
  return moving(heading, speed, lat, lon, 0);
}

export function sampleTrack(spec: TrackSpec, tSec: number): TrackSample {
  const t = Math.max(0, tSec);
  if (spec.kind === "path") return samplePath(spec, t);
  return sampleMotion(spec, t);
}

export function formatTrackTokens(sample: TrackSample): {
  lat: string;
  lon: string;
  heading: string;
  ve: string;
  vn: string;
  v2d: string;
  gz: string;
} {
  const h = sample.headingDeg >= 359.995 ? 0 : sample.headingDeg;
  return {
    lat: sample.lat.toFixed(8),
    lon: sample.lon.toFixed(8),
    heading: h.toFixed(2),
    ve: sample.ve.toFixed(3),
    vn: sample.vn.toFixed(3),
    v2d: sample.v2d.toFixed(3),
    gz: sample.gyroZ.toFixed(2),
  };
}
