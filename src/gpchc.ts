/** $GPCHC field catalog transcribed from the protocol sheet. */

export const OFFICIAL_SENTENCE =
  "$GPCHC,2396,372388.00,105.30,-0.28,0.46,0.12,-0.04,-0.02,-0.0081,-0.0049,0.9999,31.15960455,121.17847990,51.34,0.014,0.023,0.029,0.027,28,39,61,0,0102*4A";

export const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
/** Not in the sheet. Used only when the UI shows UTC. */
export const TOOL_LEAP_SECONDS = 18;

export type GroupId = "time" | "attitude" | "imu" | "nav" | "sat" | "warn";

export type FieldSpec = {
  index: number;
  key: string;
  name: string;
  short: string;
  description: string;
  note: string;
  typicalBytes: number;
  maxBytes: number;
  group: GroupId;
  unit: string;
  unitLabel: "表内" | "未规定" | "工具建议";
  rangeText: string;
  decimalsText: string;
};

export const GROUPS: { id: GroupId; title: string }[] = [
  { id: "time", title: "时间" },
  { id: "attitude", title: "姿态" },
  { id: "imu", title: "惯性" },
  { id: "nav", title: "位置与速度" },
  { id: "sat", title: "卫星与状态" },
  { id: "warn", title: "告警" },
];

export const SAT_STATUS = [
  "不定位不定向",
  "单点定位定向",
  "伪距差分定位定向",
  "组合推算",
  "RTK 稳定解定位定向（包括PPP稳定解）",
  "RTK 浮点解定位定向（包括PPP浮点解）",
  "单点定位不定向",
  "伪距差分定位不定向",
  "RTK 稳定解定位不定向",
  "RTK 浮点解定位不定向",
] as const;

export const SYS_STATUS = ["初始化", "卫导模式", "组合导航模式", "纯惯导模式"] as const;

export const WARNING_BITS: { bit: number; name: string; on: string; off: string; timing: string }[] = [
  { bit: 0, name: "GNSS模块数据", off: "正常", on: "中断", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 1, name: "车辆轮速数据", off: "正常", on: "中断", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 2, name: "PPS信号", off: "正常", on: "中断", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 3, name: "陀螺数据", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 4, name: "加表数据", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 5, name: "主天线短路", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 6, name: "主天线断路", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 7, name: "副天线短路", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 8, name: "副天线断路", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤1s" },
  { bit: 9, name: "移动网络信号", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤10s。阈值 -95dBm。无此功能默认 0" },
  { bit: 10, name: "SIM卡状态", off: "正常", on: "异常", timing: "异常时间≥60s 恢复时间≤60s。无此功能默认 0" },
  { bit: 11, name: "COSR账号", off: "正常", on: "异常", timing: "异常时间≥10s 恢复时间≤10s。表内原文为 COSR" },
  { bit: 12, name: "行驶状态", off: "前行+静止", on: "后退", timing: "速度>2km/h 有效，判断时间≤1s" },
  { bit: 13, name: "CPU告警", off: "正常", on: "CPU降频", timing: "异常时间≥10s 恢复时间≤10s" },
  { bit: 14, name: "高温告警", off: "正常", on: "CPU温度>=100℃", timing: "异常时间≥10s 恢复时间≤10s" },
  { bit: 15, name: "解算状态", off: "正常", on: "PPP模式", timing: "判断时间≤1s" },
];

const GYRO_NOTE =
  "车辆坐标系，补偿安装外参（初始外参，包含大角和小角）、补偿标定实时误差等各项已知误差。组合前输出定义：车辆坐标系，补偿安装外参（初始外参，包含大角和小角）；补偿初始零偏。";

const ACC_NOTE =
  "车辆坐标系，补偿安装外参（初始外参，包含大角和小角）、补偿标定实时误差等各项已知误差。含重力加速度。组合前输出定义：车辆坐标系，补偿安装外参（初始外参，包含大角和小角）；补偿初始零偏。表内描述原文为「陀螺仪加速度」。";

export const FIELDS: FieldSpec[] = [
  { index: 0, key: "header", name: "Header", short: "协议头", description: "GPCHC协议头", note: "", typicalBytes: 6, maxBytes: 6, group: "time", unit: "未规定", unitLabel: "未规定", rangeText: "固定 $GPCHC", decimalsText: "未规定" },
  { index: 1, key: "week", name: "GPS Week", short: "GPS周", description: "自1980-1-6至当前的星期数（GPS时间）", note: "", typicalBytes: 4, maxBytes: 4, group: "time", unit: "周", unitLabel: "表内", rangeText: "未规定", decimalsText: "未规定。示例为整数" },
  { index: 2, key: "sow", name: "GPS Time", short: "周内秒", description: "自本周日0:00:00至当前的秒数（GPS时间）", note: "", typicalBytes: 10, maxBytes: 10, group: "time", unit: "秒", unitLabel: "表内", rangeText: "未规定", decimalsText: "未规定。示例为 2 位（372388.00）" },
  { index: 3, key: "heading", name: "Heading", short: "航向角", description: "航向角（0至359.99）（精确到小数点后2位）", note: "正北（同真北）为0，顺时针为正", typicalBytes: 6, maxBytes: 6, group: "attitude", unit: "°", unitLabel: "表内", rangeText: "0 至 359.99", decimalsText: "2 位" },
  { index: 4, key: "pitch", name: "Pitch", short: "俯仰角", description: "俯仰角（-90 至 90）（精确到小数点后2位）", note: "绕车辆X轴相对平均海平面旋转的角度，遵守右手定则，通常理解车辆前高后低为正", typicalBytes: 6, maxBytes: 6, group: "attitude", unit: "°", unitLabel: "表内", rangeText: "-90 至 90", decimalsText: "2 位" },
  { index: 5, key: "roll", name: "Roll", short: "横滚角", description: "横滚角（-180 至180）（精确到小数点后2位）", note: "绕车辆Y轴相对平均海平面旋转的角度，遵守右手定则，通常理解车辆左高右低为正", typicalBytes: 5, maxBytes: 7, group: "attitude", unit: "°", unitLabel: "表内", rangeText: "-180 至 180", decimalsText: "2 位" },
  { index: 6, key: "gx", name: "Gyro X", short: "角速度X", description: "陀螺仪角速度 X 轴（精确到小数点后2位）", note: GYRO_NOTE, typicalBytes: 5, maxBytes: 7, group: "imu", unit: "未规定", unitLabel: "未规定", rangeText: "未规定", decimalsText: "2 位" },
  { index: 7, key: "gy", name: "Gyro Y", short: "角速度Y", description: "陀螺仪角速度 Y 轴（精确到小数点后2位）", note: "", typicalBytes: 5, maxBytes: 7, group: "imu", unit: "未规定", unitLabel: "未规定", rangeText: "未规定", decimalsText: "2 位" },
  { index: 8, key: "gz", name: "Gyro Z", short: "角速度Z", description: "陀螺仪角速度 Z 轴（精确到小数点后2位）", note: "", typicalBytes: 6, maxBytes: 7, group: "imu", unit: "未规定", unitLabel: "未规定", rangeText: "未规定", decimalsText: "2 位" },
  { index: 9, key: "ax", name: "Acc X", short: "加速度X", description: "陀螺仪加速度 X 轴（精确到小数点后4位，单位g）", note: ACC_NOTE, typicalBytes: 7, maxBytes: 7, group: "imu", unit: "g", unitLabel: "表内", rangeText: "未规定", decimalsText: "4 位" },
  { index: 10, key: "ay", name: "Acc Y", short: "加速度Y", description: "陀螺仪加速度 Y 轴（精确到小数点后4位，单位g）", note: "含重力加速度", typicalBytes: 7, maxBytes: 7, group: "imu", unit: "g", unitLabel: "表内", rangeText: "未规定", decimalsText: "4 位" },
  { index: 11, key: "az", name: "Acc Z", short: "加速度Z", description: "陀螺仪加速度 Z 轴（精确到小数点后4位，单位g）", note: "含重力加速度", typicalBytes: 7, maxBytes: 7, group: "imu", unit: "g", unitLabel: "表内", rangeText: "未规定", decimalsText: "4 位" },
  { index: 12, key: "lat", name: "Lat", short: "纬度", description: "纬度（-90 至 90）（精确到小数点后8位，单位°）", note: "", typicalBytes: 11, maxBytes: 12, group: "nav", unit: "°", unitLabel: "表内", rangeText: "-90 至 90", decimalsText: "8 位" },
  { index: 13, key: "lon", name: "Lon", short: "经度", description: "经度（-180 至 180）（精确到小数点后8位，单位°）", note: "", typicalBytes: 12, maxBytes: 13, group: "nav", unit: "°", unitLabel: "表内", rangeText: "-180 至 180", decimalsText: "8 位" },
  { index: 14, key: "alt", name: "Alt", short: "大地高", description: "高度，单位（米）（精确到小数点后2位）", note: "大地高，大地高=海拔高+大地水准面差距", typicalBytes: 7, maxBytes: 7, group: "nav", unit: "米", unitLabel: "表内", rangeText: "未规定", decimalsText: "2 位" },
  { index: 15, key: "ve", name: "Ve", short: "东向速度", description: "东向速度，单位（米/秒）", note: "", typicalBytes: 6, maxBytes: 6, group: "nav", unit: "米/秒", unitLabel: "表内", rangeText: "未规定", decimalsText: "未规定。示例为 3 位" },
  { index: 16, key: "vn", name: "Vn", short: "北向速度", description: "北向速度，单位（米/秒）", note: "", typicalBytes: 6, maxBytes: 6, group: "nav", unit: "米/秒", unitLabel: "表内", rangeText: "未规定", decimalsText: "未规定。示例为 3 位" },
  { index: 17, key: "vu", name: "Vu", short: "天向速度", description: "天向速度，单位（米/秒）", note: "", typicalBytes: 6, maxBytes: 6, group: "nav", unit: "米/秒", unitLabel: "表内", rangeText: "未规定", decimalsText: "未规定。示例为 3 位" },
  { index: 18, key: "v2d", name: "V_2D", short: "平面速度", description: "车辆速度，单位（米/秒）", note: "东方向和北方向的合速度，平面速度", typicalBytes: 6, maxBytes: 6, group: "nav", unit: "米/秒", unitLabel: "表内", rangeText: "未规定", decimalsText: "未规定。示例为 3 位" },
  { index: 19, key: "nsv1", name: "NSV1", short: "主天线星数", description: "主天线GNSS1可见卫星数", note: "", typicalBytes: 2, maxBytes: 2, group: "sat", unit: "颗", unitLabel: "工具建议", rangeText: "未规定", decimalsText: "未规定。示例为整数" },
  { index: 20, key: "nsv2", name: "NSV2", short: "副天线星数", description: "副天线GNSS2可见卫星数", note: "", typicalBytes: 2, maxBytes: 2, group: "sat", unit: "颗", unitLabel: "工具建议", rangeText: "未规定", decimalsText: "未规定。示例为整数" },
  { index: 21, key: "status", name: "Status", short: "状态", description: "十位数为卫星状态，个位数为系统状态", note: "十位数 0–9 见枚举。个位数 0 初始化，1 卫导模式，2 组合导航模式，3 纯惯导模式。表内称十位数为高半字节、个位数为低半字节，示例为十进制两位 61。", typicalBytes: 2, maxBytes: 2, group: "sat", unit: "未规定", unitLabel: "未规定", rangeText: "两位十进制。十位 0–9，个位 0–3", decimalsText: "两位整数" },
  { index: 22, key: "age", name: "Age", short: "差分延时", description: "差分延时", note: "", typicalBytes: 1, maxBytes: 3, group: "sat", unit: "未规定", unitLabel: "未规定", rangeText: "未规定", decimalsText: "未规定。示例为整数 0" },
  { index: 23, key: "warning", name: "Warning", short: "告警", description: "告警位。将该字段转为二进制显示，一一对应即可查看各信号状态", note: "4 位十六进制。见 bit0–bit15。", typicalBytes: 4, maxBytes: 4, group: "warn", unit: "未规定", unitLabel: "未规定", rangeText: "0000–FFFF", decimalsText: "4 位十六进制" },
  { index: 24, key: "sum", name: "Sum", short: "校验", description: "异或校验值", note: "校验从“$”到“*”之间的内容，包含标点符号", typicalBytes: 2, maxBytes: 2, group: "warn", unit: "未规定", unitLabel: "未规定", rangeText: "2 位十六进制", decimalsText: "2 位十六进制" },
  { index: 25, key: "crlf", name: "<CR><LF>", short: "包尾", description: "固定包尾", note: "", typicalBytes: 2, maxBytes: 2, group: "warn", unit: "未规定", unitLabel: "未规定", rangeText: "CR LF", decimalsText: "未规定" },
];

export const SHEET_TOTAL_TYPICAL = 168;
export const SHEET_TOTAL_MAX = 179;

export type Tokens = Record<string, string>;

export type FieldIssue = { level: "bad" | "info"; text: string };

const RANGE: Record<string, [number, number]> = {
  heading: [0, 359.99],
  pitch: [-90, 90],
  roll: [-180, 180],
  lat: [-90, 90],
  lon: [-180, 180],
};

const FIXED_DECIMALS: Record<string, number> = {
  heading: 2,
  pitch: 2,
  roll: 2,
  gx: 2,
  gy: 2,
  gz: 2,
  ax: 4,
  ay: 4,
  az: 4,
  lat: 8,
  lon: 8,
  alt: 2,
};

export function checksumOf(betweenDollarAndStar: string): string {
  let x = 0;
  for (let i = 0; i < betweenDollarAndStar.length; i++) {
    x ^= betweenDollarAndStar.charCodeAt(i);
  }
  return x.toString(16).toUpperCase().padStart(2, "0");
}

export function payloadFromTokens(tokens: Tokens): string {
  const keys = FIELDS.filter((f) => f.index <= 23).map((f) => f.key);
  return keys.map((k) => (k === "header" ? "GPCHC" : tokens[k] ?? "")).join(",");
}

export function encodeSentence(tokens: Tokens, checksumOverride?: string): string {
  const payload = payloadFromTokens(tokens);
  const sum = checksumOverride ?? checksumOf(payload);
  return `$${payload}*${sum}\r\n`;
}

export type Decoded = {
  raw: string;
  payload: string;
  tokens: Tokens;
  statedSum: string | null;
  computedSum: string;
  sumOk: boolean;
  fieldCount: number;
  issues: string[];
};

export function decodeSentence(raw: string): Decoded {
  const issues: string[] = [];
  const trimmed = raw.replace(/\r?\n$/, "");
  if (!trimmed.startsWith("$")) issues.push("缺少 $");
  const star = trimmed.lastIndexOf("*");
  if (star < 0) issues.push("缺少 *");
  const payload = trimmed.slice(1, star < 0 ? undefined : star);
  const statedSum = star < 0 ? null : trimmed.slice(star + 1);
  const computedSum = checksumOf(payload);
  const parts = payload.split(",");
  if (parts.length !== 24) issues.push(`字段数为 ${parts.length}，表内数据字段为 24（Header 至 Warning）`);
  const tokens: Tokens = {};
  const dataFields = FIELDS.filter((f) => f.index <= 23);
  dataFields.forEach((f, i) => {
    tokens[f.key] = parts[i] ?? "";
  });
  if (tokens.header && tokens.header !== "GPCHC") issues.push("Header 不是 GPCHC");
  const sumOk = statedSum !== null && statedSum.toUpperCase() === computedSum && /^[0-9A-Fa-f]{2}$/.test(statedSum);
  if (statedSum === null) issues.push("无校验");
  else if (!/^[0-9A-Fa-f]{2}$/.test(statedSum)) issues.push("校验不是 2 位十六进制");
  else if (statedSum.toUpperCase() !== computedSum) issues.push(`校验不符，计算为 ${computedSum}`);
  if (!raw.endsWith("\r\n")) issues.push("包尾不是 CRLF");
  return { raw, payload, tokens, statedSum, computedSum, sumOk, fieldCount: parts.length, issues };
}

export function fieldIssues(key: string, token: string): FieldIssue[] {
  const spec = FIELDS.find((f) => f.key === key);
  if (!spec) return [];
  const issues: FieldIssue[] = [];
  if (key === "header") {
    if (token !== "$GPCHC" && token !== "GPCHC") issues.push({ level: "bad", text: "表内协议头为 $GPCHC" });
    return issues;
  }
  if (token.length > spec.maxBytes) issues.push({ level: "bad", text: `超过最大字节数 ${spec.maxBytes}` });
  if (key === "warning") {
    if (!/^[0-9A-Fa-f]{4}$/.test(token)) issues.push({ level: "bad", text: "表内为 4 位，示例为十六进制" });
    return issues;
  }
  if (key === "status") {
    if (!/^\d{2}$/.test(token)) issues.push({ level: "bad", text: "表内典型/最大为 2 字节，示例为两位十进制" });
    else {
      const tens = Number(token[0]);
      const ones = Number(token[1]);
      if (tens > 9) issues.push({ level: "bad", text: "十位数无此卫星状态" });
      if (ones > 3) issues.push({ level: "bad", text: "个位数无此系统状态" });
    }
    return issues;
  }
  if (key === "age") return issues;
  const dec = FIXED_DECIMALS[key];
  if (dec !== undefined) {
    const re = new RegExp(`^-?\\d+\\.\\d{${dec}}$`);
    if (!re.test(token)) issues.push({ level: "bad", text: `表内要求精确到小数点后 ${dec} 位` });
    const n = Number(token);
    const range = RANGE[key];
    if (Number.isFinite(n) && range && (n < range[0] || n > range[1])) {
      issues.push({ level: "bad", text: `超出表内范围 ${spec.rangeText}` });
    }
  }
  return issues;
}

export function decodeStatus(token: string): { tens: string; ones: string; ok: boolean } {
  if (!/^\d{2}$/.test(token)) return { tens: "无法解析", ones: "无法解析", ok: false };
  const t = Number(token[0]);
  const o = Number(token[1]);
  return {
    tens: SAT_STATUS[t] ?? "表内无此枚举",
    ones: SYS_STATUS[o] ?? "表内无此枚举",
    ok: t <= 9 && o <= 3,
  };
}

export function warningMask(token: string): number | null {
  if (!/^[0-9A-Fa-f]{4}$/.test(token)) return null;
  return Number.parseInt(token, 16);
}

export function applySystemTime(tokens: Tokens, enabled: boolean, utcMs: number): Tokens {
  if (!enabled) return tokens;
  const g = gpsWeekTimeFromUtc(utcMs);
  return { ...tokens, week: g.week, sow: g.sow };
}

/** GPS = UTC + TOOL_LEAP_SECONDS. Leap seconds are a tool default, not a sheet field. */
export function gpsWeekTimeFromUtc(utcMs: number): { week: string; sow: string } {
  const gpsMs = utcMs + TOOL_LEAP_SECONDS * 1000;
  const elapsed = (gpsMs - GPS_EPOCH_MS) / 1000;
  let week = Math.floor(elapsed / 604800);
  let sow = Math.round((elapsed - week * 604800) * 100) / 100;
  if (sow >= 604800) {
    week += 1;
    sow = 0;
  }
  if (sow < 0) {
    week -= 1;
    sow = Math.round((sow + 604800) * 100) / 100;
  }
  return { week: String(week), sow: sow.toFixed(2) };
}

export function gpsCalendar(weekToken: string, sowToken: string): { gps: string; utc: string; ok: boolean } {
  const week = Number(weekToken);
  const sow = Number(sowToken);
  if (!Number.isInteger(week) || week < 0 || !Number.isFinite(sow)) {
    return { gps: "无法换算", utc: "无法换算", ok: false };
  }
  const gpsMs = GPS_EPOCH_MS + (week * 604800 + sow) * 1000;
  const gps = formatUtc(new Date(gpsMs));
  const utc = formatUtc(new Date(gpsMs - TOOL_LEAP_SECONDS * 1000));
  const wd = ["日", "一", "二", "三", "四", "五", "六"][new Date(gpsMs).getUTCDay()];
  return {
    gps: `${gps} GPS 时间（周${wd}）`,
    utc: `${utc} UTC（GPS 减 ${TOOL_LEAP_SECONDS}s，闰秒为工具建议，表内未规定）`,
    ok: true,
  };
}

function formatUtc(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function decimalMinutes(token: string, kind: "lat" | "lon"): string {
  const n = Number(token);
  if (!Number.isFinite(n)) return "无法换算";
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const deg = Math.floor(abs + 1e-10);
  const minutes = (abs - deg) * 60;
  const minText = minutes.toFixed(3).padStart(6, "0");
  const hemi = kind === "lat" ? (sign < 0 ? "S" : "N") : sign < 0 ? "W" : "E";
  return `${deg}°${minText}′${hemi}`;
}

export function v2dConsistent(tokens: Tokens): { ok: boolean; expected: number | null; text: string } {
  const ve = Number(tokens.ve);
  const vn = Number(tokens.vn);
  const v = Number(tokens.v2d);
  if (![ve, vn, v].every(Number.isFinite)) return { ok: false, expected: null, text: "无法用 Ve、Vn 核算" };
  const expected = Math.hypot(ve, vn);
  const ok = Math.abs(expected - v) <= 0.0005 + 1e-9;
  return {
    ok,
    expected,
    text: ok
      ? `与 sqrt(Ve²+Vn²)=${expected.toFixed(4)} 一致，容差 0.0005`
      : `与 sqrt(Ve²+Vn²)=${expected.toFixed(4)} 不一致`,
  };
}

export function hexDump(sentence: string, columns = 32): string {
  const bytes = [...sentence].map((ch) => ch.charCodeAt(0));
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += columns) {
    const slice = bytes.slice(i, i + columns);
    const hex = slice.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    lines.push(`${i.toString(16).padStart(4, "0")}  ${hex}`);
  }
  return lines.join("\n");
}

export function sheetByteAccount(): { typical: number; max: number; commas: number } {
  const typical = FIELDS.reduce((s, f) => s + f.typicalBytes, 0);
  const max = FIELDS.reduce((s, f) => s + f.maxBytes, 0);
  return { typical: typical + 25, max: max + 25, commas: 25 };
}
