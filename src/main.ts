import { coordinate, parseCoordinate, type CoordinateFormat } from "./coordinates.ts";
import { drawBasemap } from "./basemap.ts";
import { mountStartup } from "./startup.ts";
import { parseWorkspace, validatePath, replaySentences } from "./workspace.ts";
import helpText from "../docs/guide.txt?raw";
import { DATASETS, type Dataset } from "./datasets.ts";
import {
  FIELDS,
  GROUPS,
  WARNING_BITS,
  checksumOf,
  decimalMinutes,
  decodeSentence,
  decodeStatus,
  applySystemTime,
  encodeSentence,
  fieldIssues,
  gpsCalendar,
  hexDump,
  payloadFromTokens,
  sheetByteAccount,
  SHEET_TOTAL_MAX,
  SHEET_TOTAL_TYPICAL,
  v2dConsistent,
  warningMask,
  type Tokens,
} from "./gpchc.ts";
import { formatTrackTokens, latLonToMeters, metersToLatLon, sampleTrack, sampleDynamics, type LatLon, type TrackSpec } from "./track.ts";

type StreamRow = {
  id: number;
  dir: "发送" | "接收" | "预览";
  at: string;
  sentence: string;
  note: string;
};

let streamTimer=0;
const archive: (StreamRow & { timestamp: string })[] = [];
const state = {
  datasetId: DATASETS[0].id,
  tokens: { ...DATASETS[0].tokens } as Tokens,
  checksumOverride: undefined as string | undefined,
  running: false,
  timer: 0,
  savedTime: null as { week: string; sow: string } | null,
  trackOn: false,
  trackT0: 0,
  trackFrame: 0,
  path: [] as LatLon[],
  mapView: null as null | { origin: LatLon; ox: number; oy: number; scale: number },
  rows: [] as StreamRow[],
  selectedRow: 0,
  seq: 1,
  previewMotion: false,
  streamFrozen: false,
  receivedTokens: null as Tokens | null,
  mapTrail: [] as LatLon[],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function dataset(): Dataset {
  return DATASETS.find((d) => d.id === state.datasetId) ?? DATASETS[0];
}

function applyDataset(id: string) {
  const d = DATASETS.find((x) => x.id === id) ?? DATASETS[0];
  setTrack(false); frozenTrackTime=0; state.mapTrail=[]; state.previewMotion=Boolean(d.motion);
  state.datasetId = d.id;
  state.tokens = { ...d.tokens };
  state.checksumOverride = d.checksumOverride;
  if (d.motion) ($('track-kind') as HTMLSelectElement).value=d.motion;
  if(Math.abs(Number(d.tokens.lat))<=90&&Math.abs(Number(d.tokens.lon))<=180) {
    ($('track-lat') as HTMLInputElement).value=Number(d.tokens.lat).toFixed(8);
    ($('track-lon') as HTMLInputElement).value=Number(d.tokens.lon).toFixed(8);
  }
  ($('track-heading') as HTMLInputElement).value=d.tokens.heading;
  renderDataset();
  renderFields();
  renderWire();drawMap();
  const preview = currentSentence();
  pushRow("预览", preview, d.fault ? "故障注入预览" : "当前数据集");
  for (const extra of d.extraSentences ?? []) pushRow("接收", extra.sentence, extra.label);
}

function currentSentence(): string {
  return encodeSentence(state.tokens, state.checksumOverride);
}

function renderDataset() {
  const host = $("dataset-list");
  host.innerHTML = "";
  for (const d of DATASETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "set" + (d.id === state.datasetId ? " is-on" : "") + (d.fault ? " is-fault" : "");
    b.innerHTML = `<span class="scenario-tag">${d.fault ? "协议故障" : d.id === "official" ? "协议基准" : "工况模拟"}</span><strong>${escapeHtml(d.name)}</strong><small>${escapeHtml(d.purpose)}</small>`;
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", d.id === state.datasetId ? "true" : "false");
    b.addEventListener("click", () => {($("map-source") as HTMLSelectElement).value="current";applyDataset(d.id);});
    host.appendChild(b);
  }
  const d = dataset();
  $("dataset-purpose").innerHTML = `<strong>${d.fault ? "故障注入" : "本条用途"}</strong>${d.purpose}`;
}

function renderFields() {
  const root = $("groups");
  root.innerHTML = "";
  const more = document.createElement("details");
  more.className = "more";
  const summary = document.createElement("summary");
  summary.textContent = "时间、姿态、位置";
  more.appendChild(summary);
  const moreCols = document.createElement("div");
  moreCols.className = "board-cols";
  moreCols.appendChild(groupCard("time"));
  moreCols.appendChild(groupCard("attitude"));
  moreCols.appendChild(groupCard("nav", ["lat", "lon", "alt"]));
  more.appendChild(moreCols);
  root.appendChild(more);

  const cols = document.createElement("div");
  cols.className = "board-cols key-cols";
  cols.appendChild(groupCard("sat"));
  cols.appendChild(groupCard("imu"));
  cols.appendChild(groupCard("nav", ["ve", "vn", "vu", "v2d"]));
  root.appendChild(cols);
  root.appendChild(groupCard("warn"));
  refreshDerived();
}

function groupCard(id: (typeof GROUPS)[number]["id"], keys?: string[]) {
  const g = GROUPS.find((x) => x.id === id)!;
  const card = document.createElement("section");
  card.className = "card";
  card.dataset.group = g.id;
  const h = document.createElement("h3");
  h.textContent = keys?.includes("ve") ? "速度" : g.title;
  card.appendChild(h);
  if (g.id === "time") {
    const cal = document.createElement("div");
    cal.id = "calendar";
    cal.className = "cal";
    card.appendChild(cal);
  }
  const body = document.createElement("div");
  body.className = "fields" + (g.id === "imu" ? " fields-2" : "");
  for (const f of FIELDS.filter((f) => f.group === g.id && f.key !== "sum" && f.key !== "crlf")) {
    if (keys && !keys.includes(f.key)) continue;
    if (f.key === "warning") {
      body.appendChild(warningPanel());
      continue;
    }
    body.appendChild(fieldRow(f.key));
  }
  card.appendChild(body);
  return card;
}

function fieldRow(key: string) {
  const spec = FIELDS.find((f) => f.key === key)!;
  const wrap = document.createElement("div");
  wrap.className = "field";
  wrap.dataset.key = key;
  const unitFact = spec.unitLabel === "表内" ? spec.unit : spec.unitLabel;
  const decFact = spec.decimalsText.startsWith("未规定") ? "小数位未规定" : spec.decimalsText;
  wrap.title = `${spec.description}${spec.note ? "。" + spec.note : ""}。单位 ${unitFact}。范围 ${spec.rangeText}。${decFact}`;
  wrap.innerHTML = `
    <div class="field-name">${spec.name}<span>${spec.short}</span></div>
    <input aria-label="${spec.name} ${spec.short}" spellcheck="false" />
    <div class="token"></div>
    <div class="meta"></div>
    <div class="issue"></div>
  `;
  const input = wrap.querySelector("input") as HTMLInputElement;
  input.value = key === "header" ? "$GPCHC" : key==="lat"||key==="lon" ? coordinateInput(state.tokens[key],key) : state.tokens[key] ?? "";
  if(key==="lat"||key==="lon") input.dataset.coordFormat=coordFormat();
  input.readOnly = key === "header";
  input.addEventListener("input", () => {
    if (key === "header") return;
    if(key==='lat'||key==='lon') {
      try {
        const n=parseCoordinate(input.value,key,(input.dataset.coordFormat??coordFormat()) as CoordinateFormat);
        input.setCustomValidity('');state.tokens[key]=n.toFixed(8);
      } catch(e) {
        const message=e instanceof Error?e.message:String(e);input.setCustomValidity(message);
        (wrap.querySelector('.issue') as HTMLElement).textContent=message;return;
      }
    } else state.tokens[key] = input.value.trim();
    state.checksumOverride = undefined;refreshDerived();renderWire();drawMap();
  });
  if(key==='lat'||key==='lon') input.addEventListener('change',()=>{
    if(!input.checkValidity()){input.reportValidity();return;}
    input.value=coordinateInput(state.tokens[key],key);
    if(!state.trackOn) setTrackCoordinate(key,Number(state.tokens[key]));
    drawMap();
  });
  return wrap;
}

function warningPanel() {
  const box = document.createElement("div");
  box.id = "warning-panel";
  const inputWrap = fieldRow("warning");
  box.appendChild(inputWrap);
  const bits = document.createElement("div");
  bits.className = "bits";
  bits.id = "bits";
  box.appendChild(bits);
  return box;
}

function refreshDerived() {
  for (const f of FIELDS) {
    if (f.key === "sum" || f.key === "crlf") continue;
    const row = document.querySelector(`.field[data-key="${f.key}"]`);
    if (!row) continue;
    const input = row.querySelector("input") as HTMLInputElement;
    if (document.activeElement !== input && !input.validity.customError) {
      input.value = f.key === "header" ? "$GPCHC" : f.key==="lat"||f.key==="lon" ? coordinateInput(state.tokens[f.key],f.key) : state.tokens[f.key] ?? "";
      if(f.key==="lat"||f.key==="lon")input.dataset.coordFormat=coordFormat();
    }
    const token = f.key === "header" ? "$GPCHC" : state.tokens[f.key] ?? "";
    const issues = fieldIssues(f.key, token);
    input.classList.toggle("bad", issues.some((i) => i.level === "bad"));
    const shown = f.key === "header" ? "$GPCHC" : token;
    const tokenEl = row.querySelector(".token") as HTMLElement;
    tokenEl.textContent = shown;
    const meta = row.querySelector(".meta") as HTMLElement;
    let metaText = "";
    if (f.key === "lat" || f.key === "lon") metaText = coordinate(Number(token), f.key, coordFormat());
    if (f.key === "status") {
      const st = decodeStatus(token);
      tokenEl.textContent = `${st.tens} / ${st.ones}`;
    }
    meta.textContent = metaText;
    row.classList.toggle("has-meta", metaText.length > 0);
    (row.querySelector(".issue") as HTMLElement).textContent = issues.map((i) => i.text).join("；");
    if (f.key === "v2d") {
      const speed = v2dConsistent(state.tokens);
      row.title = `${f.description}。${speed.text}`;
    }
  }
  const cal = gpsCalendar(state.tokens.week, state.tokens.sow);
  const calEl = $("calendar");
  if (calEl) {
    calEl.textContent = cal.gps;
    calEl.title = cal.utc;
  }
  renderBits();
}

function renderBits() {
  const host = $("bits");
  host.innerHTML = "";
  const mask = warningMask(state.tokens.warning ?? "");
  for (const b of WARNING_BITS) {
    const on = mask !== null && (mask & (1 << b.bit)) !== 0;
    const el = document.createElement("div");
    el.className = "bit" + (on ? " on" : "");
    el.title = b.timing;
    el.innerHTML = `<div class="bn">bit${b.bit} ${b.name}</div><div class="bs">${mask === null ? "无法按位查看" : on ? `1 ${b.on}` : `0 ${b.off}`}</div>`;
    host.appendChild(el);
  }
}

function renderWire() {
  const sentence = currentSentence();
  const star = sentence.lastIndexOf("*");
  const payload = sentence.slice(1, star);
  const stated = sentence.slice(star + 1).replace(/\r?\n/g, "");
  const computed = checksumOf(payload);
  const ok = stated.toUpperCase() === computed;
  $("sentence").textContent = sentence.replace(/\r\n$/, "") + "\\r\\n";
  const line = $("checksum-line");
  line.textContent = ok ? `异或 = ${computed} ，报文 *${stated} ，一致` : `异或 = ${computed} ，报文 *${stated} ，不一致`;
  line.className = "check-line " + (ok ? "ok" : "bad");
  $("checksum-body").textContent = state.checksumOverride ? "校验被故障注入改写。" : "";
  $("checksum-line").title = `异或范围是 $ 与 * 之间的 ${payload.length} 个字符，含逗号，不含两端符号。共 ${sentence.length} 字节，含 CRLF。`;
  $("hexdump").textContent = hexDump(sentence, 56);
}

function pushRow(dir: StreamRow["dir"], sentence: string, note: string) {
  const row: StreamRow = {
    id: state.seq++,
    dir,
    at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    sentence,
    note,
  };
  if(dir==="接收"){state.receivedTokens=decodeSentence(sentence).tokens;if(($("map-source") as HTMLSelectElement).value==="receive")drawMap();}
  archive.push({ ...row, timestamp: new Date().toISOString() });
  if (archive.length > 100000) archive.shift();
  state.rows.unshift(row);
  state.rows = state.rows.slice(0, 30);
  if (!state.streamFrozen) { state.selectedRow = row.id; if(!streamTimer)streamTimer=window.setTimeout(()=>{streamTimer=0;if(!state.streamFrozen)renderStream();},150); }
}

function renderStream() {
  const host = $("stream");
  host.innerHTML = "";
  if (state.rows.length === 0) {
    host.textContent = "还没有报文。发送或粘贴后会出现在这里。";
    $("parse").textContent = "";
    return;
  }
  for (const row of state.rows) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "row" + (row.id === state.selectedRow ? " is-on" : "");
    const decoded = decodeSentence(row.sentence);
    b.innerHTML = `<span>${row.at}</span><span>${row.dir}</span><span class="mono">${escapeHtml(row.sentence.trim())}</span><span>${decoded.sumOk ? "校验通过" : "校验异常"}</span>`;
    b.addEventListener("click", () => {
      state.selectedRow = row.id;
      renderStream();
    });
    host.appendChild(b);
  }
  const selected = state.rows.find((r) => r.id === state.selectedRow) ?? state.rows[0];
  renderParse(selected);
}

function renderParse(row: StreamRow) {
  const decoded = decodeSentence(row.sentence);
  const box = $("parse");
  const st = decodeStatus(decoded.tokens.status ?? "");
  const mask = warningMask(decoded.tokens.warning ?? "");
  const onBits = WARNING_BITS.filter((b) => mask !== null && mask & (1 << b.bit)).map((b) => `bit${b.bit} ${b.name}`);
  const parts = [`<div class="parse-item wide"><b>${row.dir}</b>${row.note} · ${row.at}</div>`];
  for (const issue of decoded.issues) parts.push(`<div class="parse-item wide bad-text">${escapeHtml(issue)}</div>`);
  for (const f of FIELDS) {
    if (f.index > 23) continue;
    const token = f.key === "header" ? `$${decoded.tokens.header ?? ""}` : decoded.tokens[f.key] ?? "";
    let extra = "";
    if (f.key === "lat" || f.key === "lon") extra = ` · ${coordinate(Number(token),f.key,coordFormat())}`;
    if (f.key === "status") extra = ` · ${st.tens} / ${st.ones}`;
    if (f.key === "warning") extra = onBits.length ? ` · ${onBits.join("，")}` : "";
    const wide = f.key === "status" || f.key === "warning" ? " wide" : "";
    parts.push(`<div class="parse-item${wide}"><b>${f.name}</b>${escapeHtml(token)}${escapeHtml(extra)}</div>`);
  }
  parts.push(`<div class="parse-item"><b>Sum</b>报文 ${decoded.statedSum ?? "无"} · 计算 ${decoded.computedSum}</div>`);
  box.innerHTML = parts.join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

type Nic = { name: string; address: string; internal: boolean };
type LivePacket = {
  sentence?: string;
  from?: string;
  port?: number;
  error?: string;
  channel?: string;
  status?: { udp?: string; tcp?: string };
};

declare global {
  interface Window {
    beidou?: {
      fullscreen: (toggle?:boolean) => Promise<boolean>;
      nics: () => Promise<Nic[]>;
      listen: (cfg: Record<string, unknown>) => Promise<unknown>;
      send: (cfg: Record<string, unknown>) => Promise<{ ok?: boolean; bytes?: number; error?: string; channels?: string[]; tcpError?: string }>;
      onPacket: (cb: (packet: LivePacket) => void) => void;
      onStatus?: (cb: (status: { udp?: string; tcp?: string }) => void) => void;
    };
  }
}

function netConfig() {
  return {
    host: ($("host") as HTMLInputElement).value.trim() || "224.100.100.1",
    port: Number(($("port") as HTMLInputElement).value) || 6020,
    iface: ($("iface") as HTMLSelectElement).value,
    unicastEnabled: ($("unicast-on") as HTMLInputElement).checked,
    unicastHost: ($("unicast-host") as HTMLInputElement).value.trim(),
    unicastPort: Number(($("unicast-port") as HTMLInputElement).value)||6022,
    udpEnabled: ($("udp-on") as HTMLInputElement).checked,
    tcpEnabled: ($("tcp-on") as HTMLInputElement).checked,
    tcpMode: ($("tcp-mode") as HTMLSelectElement).value,
    tcpHost: ($("tcp-host") as HTMLInputElement).value.trim() || "127.0.0.1",
    tcpPort: Number(($("tcp-port") as HTMLInputElement).value) || 6021,
  };
}

function showLinkStatus(status: { udp?: string; tcp?: string }) {
  $("link-status").textContent = `${status.udp ?? ""} · ${status.tcp ?? ""}`;
}

function showNetError(text: string) {
  const el = $("net-status");
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function acceptLive(packet: LivePacket) {
  if (packet.status) {
    showLinkStatus(packet.status);
    return;
  }
  if (packet.error) {
    showNetError(packet.error);
    return;
  }
  if (!packet.sentence) return;
  const normalized = packet.sentence.replace(/[\r\n]+$/, '')+'\r\n';
  const via = packet.channel === "tcp" ? "TCP" : "UDP";
  pushRow("接收", normalized, `${via} ${packet.from ?? ""}:${packet.port ?? ""}`);
}

async function refreshNics() {
  const nics = window.beidou ? await window.beidou.nics() : ((await (await fetch("./api/nics")).json()) as Nic[]);
  const sel = $("iface") as HTMLSelectElement;
  const prev = sel.value;
  sel.innerHTML = "";
  for (const nic of nics) {
    const option = document.createElement("option");
    option.value = nic.address;
    option.textContent = `${nic.name} ${nic.address}`;
    sel.appendChild(option);
  }
  const preferred = nics.find((n) => n.address === prev) || nics.find((n) => !n.internal) || nics[0];
  if (preferred) sel.value = preferred.address;
}

async function joinGroup() {
  const cfg = netConfig();
  try {
    if (window.beidou) await window.beidou.listen(cfg);
    else {
      const res = await fetch("./api/listen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || String(res.status));
    }
    showNetError("");
    ($("iface") as HTMLSelectElement).title = `同一张网卡 ${cfg.iface || "默认"}。UDP 打开时发送 IGMP 加入并打开本机环回。TCP 绑定该网卡 IPv4。`;
  } catch (err) {
    showNetError(`加入组播失败：${err instanceof Error ? err.message : String(err)}`);
  }
}

function stampLive() {
  const useTime = ($("use-sys-time") as HTMLInputElement).checked;
  if (useTime) {
    const next = applySystemTime(state.tokens, true, Date.now());
    state.tokens.week = next.week;
    state.tokens.sow = next.sow;
  }
  if (state.trackOn) {
    const motion = liveMotion((performance.now() - state.trackT0) / 1000);
    const text = { ...formatTrackTokens(motion), pitch: motion.pitch.toFixed(2), roll: motion.roll.toFixed(2), ax: motion.ax.toFixed(4), ay: motion.ay.toFixed(4), az: motion.az.toFixed(4) };
    Object.assign(state.tokens, text);
  }
  if (useTime || state.trackOn) {
    refreshDerived();
    renderWire();
  }
}

async function sendOnce() {
  stampLive();
  const sentence = currentSentence();
  const cfg = netConfig();
  try {
    const data = window.beidou
      ? await window.beidou.send({ ...cfg, sentence })
      : ((await (await fetch("./api/send", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...cfg, sentence }),
        })).json()) as { ok?: boolean; bytes?: number; error?: string; channels?: string[]; tcpError?: string });
    if (data.ok === false) pushRow("发送", sentence, `未发出：${data.error ?? ""}`);
    else {
      const channels = (data.channels ?? []).join("+") || "无";
      const extra = data.tcpError ? ` · ${data.tcpError}` : "";
      pushRow("发送", sentence, `${channels} ${cfg.host}:${cfg.port} · ${data.bytes ?? sentence.length} 字节 · ${cfg.iface || "默认网卡"}${extra}`);
    }
  } catch (err) {
    pushRow("发送", sentence, `未发出：${err instanceof Error ? err.message : String(err)}`);
  }
}

function setRunning(on: boolean) {
  if(dataset().motion) setTrack(on);
  state.running = on;
  window.clearInterval(state.timer);
  const run = $("send-run");
  run.classList.toggle("is-on", on);
  run.setAttribute("aria-pressed", on ? "true" : "false");
  const hz = Number(($("rate") as HTMLInputElement).value);
  const rate = Number.isFinite(hz) && hz > 0 ? hz : 10;
  run.textContent = on ? "暂停" : "连续发送";
  run.title = on ? `正在按 ${rate} Hz 发送。该速率是工具建议，表内未规定。` : "按工具建议的速率连续发送";
  if (on) {
    void sendOnce();
    state.timer = window.setInterval(() => void sendOnce(), 1000 / rate);
  }
}

function renderProtocol() {
  const host = $("proto");
  const account = sheetByteAccount();
  const rows = FIELDS.map((f) => {
    return `<tr>
      <td>字段${f.index}</td><td>${f.name}</td><td>${escapeHtml(f.description)}</td>
      <td>${f.typicalBytes}</td><td>${f.maxBytes}</td>
      <td>${escapeHtml(f.unit)}（${f.unitLabel}）</td>
      <td>${escapeHtml(f.rangeText)}</td>
      <td>${escapeHtml(f.decimalsText)}</td>
      <td>${escapeHtml(f.note)}</td>
    </tr>`;
  }).join("");
  const sats = ["0 不定位不定向", "1 单点定位定向", "2 伪距差分定位定向", "3 组合推算", "4 RTK 稳定解定位定向（包括PPP稳定解）", "5 RTK 浮点解定位定向（包括PPP浮点解）", "6 单点定位不定向", "7 伪距差分定位不定向", "8 RTK 稳定解定位不定向", "9 RTK 浮点解定位不定向（表内原文作「9-RTK 浮点解定位不定向」）"];
  const sys = ["0 初始化", "1 卫导模式", "2 组合导航模式", "3 纯惯导模式"];
  const bits = WARNING_BITS.map((b) => `<li>bit${b.bit} ${b.name}：0 ${b.off}，1 ${b.on}。${b.timing}</li>`).join("");
  host.innerHTML = `
    <div class="proto-block">
      <h2>表题</h2>
      <p>$GPCHC（华测自定ACSII格式协议）。ASCII，逗号分隔。固定包尾 CR LF。</p>
    </div>
    <div class="proto-block">
      <h2>示例</h2>
      <p class="mono">$GPCHC,2396,372388.00,105.30,-0.28,0.46,0.12,-0.04,-0.02,-0.0081,-0.0049,0.9999,31.15960455,121.17847990,51.34,0.014,0.023,0.029,0.027,28,39,61,0,0102*4A</p>
    </div>
    <div class="proto-block">
      <h2>字节数</h2>
      <p>表内总字节数典型 ${SHEET_TOTAL_TYPICAL}，最大 ${SHEET_TOTAL_MAX}。各字段典型字节之和加 25 个逗号 = ${account.typical}。各字段最大字节之和加 25 个逗号 = ${account.max}。星号是否计入总字节，表内没有单列。示例 GPS Time 为 9 字节，短于典型 10。</p>
    </div>
    <div class="proto-block">
      <h2>校验</h2>
      <p>表内：校验从“$”到“*”之间的内容，包含标点符号。本工具对 $ 与 * 之间的每个字符做异或，不含 $ 与 *。协议示例得到 4A。</p>
    </div>
    <div class="proto-block">
      <h2>卫星状态（十位）与系统状态（个位）</h2>
      <ul>${sats.map((s) => `<li>${s}</li>`).join("")}</ul>
      <ul>${sys.map((s) => `<li>${s}</li>`).join("")}</ul>
      <p>示例 61 = 单点定位不定向 + 卫导模式。</p>
    </div>
    <div class="proto-block">
      <h2>Warning bit0–bit15</h2>
      <ul>${bits}</ul>
      <p>示例 0102：bit1 与 bit8 为 1，即车辆轮速中断、副天线断路。</p>
    </div>
    <div class="proto-block">
      <h2>表内未规定，界面写「未规定」</h2>
      <ul>
        <li>陀螺角速度单位。工具若按 °/s 理解，会标明工具建议。</li>
        <li>差分延时 Age 的单位和小数位。示例为整数 0。</li>
        <li>Ve、Vn、Vu、V_2D 的小数位。示例为 3 位。工具按示例书写。</li>
        <li>可见星数量的单位与范围。示例为整数。</li>
        <li>陀螺、加速度、高度、速度的数值范围。</li>
        <li>闰秒。界面上的 UTC 使用 18 秒，并标明工具建议。</li>
        <li>发送率。默认 10 Hz 是工具建议。组播 224.100.100.1:6020 来自使用要求，不是表内字段。</li>
      </ul>
    </div>
    <table class="proto-table">
      <thead><tr><th>序号</th><th>名称</th><th>描述</th><th>典型字节</th><th>最大字节</th><th>单位</th><th>范围</th><th>小数</th><th>备注</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function show(view: "board" | "proto" | "track") {
  $("board").hidden = view !== "board";
  $("proto").hidden = view !== "proto";
  $("track").hidden = view !== "track";
  for (const [id, name] of [["tab-board", "board"], ["tab-proto", "proto"], ["tab-track", "track"]] as const) {
    $(id).classList.toggle("is-on", view === name);
    $(id).setAttribute("aria-pressed", view === name ? "true" : "false");
  }
  $("board").hidden = view === "proto";
  $("track").hidden = false;
  if (view === "track") {drawMap();$("track").scrollIntoView({behavior:"smooth",block:"start"});}
}

function numInput(id: string, fallback: number): number {
  const el=$(id) as HTMLInputElement;
  const n = Number((id==="track-lat"||id==="track-lon") ? el.dataset.decimal??el.value : el.value);
  return Number.isFinite(n) ? n : fallback;
}

function trackSpec(): TrackSpec {
  const kind = ($("track-kind") as HTMLSelectElement).value;
  const lat = numInput("track-lat", 31.15960455);
  const lon = numInput("track-lon", 121.1784799);
  const headingDeg = numInput("track-heading", 0);
  const speedMps = numInput("track-speed", 10);
  const radiusM = numInput("track-radius", 80);
  if (kind === "path") {
    const points = state.path.length ? state.path : [{ lat, lon }];
    return { kind: "path", points, speedMps, loop: ($("track-loop") as HTMLInputElement).checked };
  }
  return { kind: kind as "line" | "circle" | "eight", lat, lon, headingDeg, speedMps, radiusM };
}

function liveMotion(t: number) { return sampleDynamics(trackSpec(), t, numInput("track-accel", 2)); }

function drawMap() {
  const canvas = $("track-map") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width;
  const h = rect.height;
  ctx.fillStyle = "#d7e6df";
  ctx.fillRect(0, 0, w, h);
  const spec = trackSpec();
  const elapsed = state.trackOn ? (performance.now() - state.trackT0) / 1000 : 0;
  const mapTokens=($("map-source") as HTMLSelectElement).value==="receive" ? state.receivedTokens ?? {} : state.tokens;
  const lat=mapTokens.lat?.trim()?Number(mapTokens.lat):NaN,lon=mapTokens.lon?.trim()?Number(mapTokens.lon):NaN;
  const valid=Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
  const now = {lat:valid?lat:numInput('track-lat',31.15960455),lon:valid?lon:numInput('track-lon',121.17847990),headingDeg:Number(mapTokens.heading)||0,ve:Number(mapTokens.ve)||0,vn:Number(mapTokens.vn)||0,v2d:Number(mapTokens.v2d)||0,gyroZ:Number(mapTokens.gz)||0};
  $('map-status').textContent=valid?'':'坐标超范围，故障报文不绘制定位点';
  const preview: LatLon[] = [];
  const steps = spec.kind === "path" ? Math.max(2, spec.points.length * 8) : 80;
  const horizon = spec.kind === "line" ? 20 : spec.kind === "path" ? 60 : ((spec.kind === "eight" ? 4 : 2) * Math.PI * Math.max(1, numInput("track-radius", 80))) / Math.max(0.1, numInput("track-speed", 10));
  for (let i = 0; i <= steps; i++) preview.push(sampleTrack(spec, (horizon * i) / steps));
  if (spec.kind === "path") preview.splice(0, preview.length, ...spec.points, ...(spec.loop && spec.points.length ? [spec.points[0]] : []));
  const origin = ($("map-source") as HTMLSelectElement).value==="receive"&&valid ? {lat,lon} : { lat: numInput("track-lat", 31.15960455), lon: numInput("track-lon", 121.1784799) };
  if(!state.previewMotion)preview.length=0;
  const pts = [...preview, now, origin];
  const meters = pts.map((p) => latLonToMeters(origin, p));
  let minE = Math.min(...meters.map((p) => p.east));
  let maxE = Math.max(...meters.map((p) => p.east));
  let minN = Math.min(...meters.map((p) => p.north));
  let maxN = Math.max(...meters.map((p) => p.north));
  if (maxE - minE < 700) {
    minE -= 350;
    maxE += 350;
  }
  if (maxN - minN < 700) {
    minN -= 350;
    maxN += 350;
  }
  const pad = 28;
  const scale = Math.min((w - pad * 2) / (maxE - minE), (h - pad * 2) / (maxN - minN));
  const ox = pad + (w - pad * 2 - (maxE - minE) * scale) / 2 - minE * scale;
  const oy = pad + (h - pad * 2 - (maxN - minN) * scale) / 2 + maxN * scale;
  state.mapView = { origin, ox, oy, scale };
  const at = (p: LatLon) => {
    const m = latLonToMeters(origin, p);
    return { x: ox + m.east * scale, y: oy - m.north * scale };
  };
  drawBasemap(ctx,ox,oy,scale,w,h);
  ctx.strokeStyle = "#0c6b5c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  preview.forEach((p, i) => {
    const q = at(p);
    if (i) ctx.lineTo(q.x, q.y);
    else ctx.moveTo(q.x, q.y);
  });
  ctx.stroke();
  if (spec.kind === "path") {
    ctx.fillStyle = "#12362f";
    for (const p of spec.points) {
      ctx.beginPath();
      const q = at(p);
      ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if(valid && state.mapTrail.length) {ctx.beginPath();ctx.strokeStyle='#dd9e31';ctx.lineWidth=3;state.mapTrail.forEach((p,i)=>{const q=at(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.stroke();}
  const here = at(now);
  const x = here.x;
  const y = here.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((now.headingDeg * Math.PI) / 180);
  ctx.fillStyle = "#9d1730";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(6, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  if(valid)ctx.fill();
  ctx.restore();
  const text = formatTrackTokens(now);
  $("track-readout").textContent = `纬 ${coordinate(lat,'lat',coordFormat())}  经 ${coordinate(lon,'lon',coordFormat())}  航向 ${text.heading}°  速度 ${text.v2d} m/s`;
  $('map-summary').textContent=`${dataset().name} · ${decodeStatus(mapTokens.status??"").tens} · 告警 ${mapTokens.warning??"—"}`;
}

let frozenTrackTime = 0;
function setTrack(on: boolean) {
  if (!on && state.trackOn) frozenTrackTime = (performance.now() - state.trackT0)/1000;
  state.trackOn = on;
  window.cancelAnimationFrame(state.trackFrame);
  const button = $("track-run");
  button.textContent = on ? "暂停运动" : "开始运动";
  button.classList.toggle("is-on", on);
  button.setAttribute("aria-pressed", on ? "true" : "false");
  if (!on) {drawMap();return;}
  ($("map-source") as HTMLSelectElement).value="current";
  state.previewMotion=true;
  state.trackT0 = performance.now() - frozenTrackTime * 1000;
  const loop = () => {
    if (!state.trackOn) return;
    stampLive();
    const last=state.mapTrail[state.mapTrail.length-1];
    const next={lat:Number(state.tokens.lat),lon:Number(state.tokens.lon)};
    if(!last || Math.hypot(next.lat-last.lat,next.lon-last.lon)>0.000005){state.mapTrail.push(next);if(state.mapTrail.length>2000)state.mapTrail.shift();}
    drawMap();
    state.trackFrame = window.requestAnimationFrame(loop);
  };
  state.trackFrame = window.requestAnimationFrame(loop);
}

$("tab-board").addEventListener("click", () => show("board"));
$("tab-track").addEventListener("click", () => show("track"));
$("tab-proto").addEventListener("click", () => show("proto"));
$("track-run").addEventListener("click", () => setTrack(!state.trackOn));
$("track-clear").addEventListener("click", () => {
  state.path = [];
  drawMap();
});
($("track-map") as HTMLCanvasElement).addEventListener("click", (ev) => {
  if (($("track-kind") as HTMLSelectElement).value !== "path") return;
  if (!state.mapView) drawMap();
  const view = state.mapView;
  if (!view) return;
  const canvas = ev.currentTarget as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const east = (x - view.ox) / view.scale;
  const north = (view.oy - y) / view.scale;
  state.path.push(metersToLatLon(view.origin, east, north));
  drawMap();
});
for (const id of ["track-accel", "track-kind", "track-lat", "track-lon", "track-heading", "track-speed", "track-radius", "track-loop"]) {
  $(id).addEventListener("change", () => {
    frozenTrackTime = 0;state.previewMotion=true;state.mapTrail=[];
    if (state.trackOn) state.trackT0 = performance.now();
    drawMap();
  });
}
$("hex-toggle").addEventListener("click", () => {
  const dump = $("hexdump");
  dump.hidden = !dump.hidden;
  $("hex-toggle").classList.toggle("is-on", !dump.hidden);
});
$("send-once").addEventListener("click", () => void sendOnce());
$("send-run").addEventListener("click", () => setRunning(!state.running));
($("rate") as HTMLInputElement).addEventListener("change", () => {
  if (state.running) setRunning(true);
});
$("paste-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = ($("paste") as HTMLInputElement).value.trim();
  if (!text) return;
  const sentence = text.endsWith("\n") ? text.replace(/\n$/, "\r\n") : text + "\r\n";
  pushRow("接收", sentence.includes("\r\n") ? sentence : sentence + "\r\n", "粘贴");
});

for (const id of ["unicast-on", "unicast-host", "unicast-port", "host", "port", "iface", "udp-on", "tcp-on", "tcp-mode", "tcp-host", "tcp-port"]) {
  $(id).addEventListener("change", () => void joinGroup());
}
($("use-sys-time") as HTMLInputElement).addEventListener("change", () => {
  const on = ($("use-sys-time") as HTMLInputElement).checked;
  if (on) state.savedTime = { week: state.tokens.week ?? "", sow: state.tokens.sow ?? "" };
  else if (state.savedTime) {
    state.tokens.week = state.savedTime.week;
    state.tokens.sow = state.savedTime.sow;
    state.savedTime = null;
    refreshDerived();
    renderWire();
  }
});

renderDataset();
renderFields();
renderWire();
renderProtocol();
pushRow("预览", currentSentence(), "协议示例原句");

if (window.beidou) {
  window.beidou.onPacket(acceptLive);
  window.beidou.onStatus?.((status) => showLinkStatus(status));
} else {
  const events = new EventSource("./api/events");
  events.onmessage = (ev) => acceptLive(JSON.parse(ev.data) as LivePacket);
}
const nicsReady = refreshNics();

const controlIds = ['coord-format','unicast-on','unicast-host','unicast-port','host','port','iface','rate','udp-on','tcp-on','tcp-mode','tcp-host','tcp-port','use-sys-time','track-kind','track-lat','track-lon','track-heading','track-speed','track-radius','track-accel','track-loop'];
const statusText = (text: string) => { $('file-status').textContent = text; };
function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content],{type}));
  const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function snapshot() {
  const controls: Record<string,string|boolean> = {};
  for(const id of controlIds) { const el=$(id) as HTMLInputElement; controls[id]=el.type==='checkbox'?el.checked:(id==='track-lat'||id==='track-lon')?String(numInput(id,0)):el.value; }
  return {version:1 as const,datasetId:state.datasetId,tokens:state.tokens,controls,path:state.path,checksumOverride:state.checksumOverride};
}
function restore(text: string) {
  const v=parseWorkspace(text);
  if(!DATASETS.some(d=>d.id===v.datasetId)) throw new Error('未知的数据集');
  setRunning(false); setTrack(false); stopReplay(); frozenTrackTime=0;
  state.datasetId=v.datasetId; state.tokens={...v.tokens}; state.path=v.path; state.checksumOverride=v.checksumOverride;
  for(const id of controlIds) { const el=$(id) as HTMLInputElement; const value=v.controls[id]; if(typeof value==='boolean'&&el.type==='checkbox')el.checked=value; else if(typeof value==='string'&&el.type!=='checkbox')el.value=value; }
  refreshTrackCoordinates(true);previousCoordFormat=coordFormat();
  state.previewMotion=Boolean(dataset().motion); state.mapTrail=[];
  updateRateHint();
  state.savedTime=null; renderDataset(); renderFields(); renderWire(); drawMap(); void joinGroup();
}
function guarded(action: ()=>void) { try { action(); } catch(e) { statusText(e instanceof Error?e.message:String(e)); } }
$('save-config').onclick=()=>guarded(()=>{ const text=JSON.stringify(snapshot(),null,2); localStorage.setItem('beichen-config',text); download('beichen-config.json',text); statusText('配置已保存到本机并导出'); });
let fileAction: 'config'|'path'|'replay'='config';
const picker=$('file-picker') as HTMLInputElement;
function pick(action: typeof fileAction) { fileAction=action; picker.accept=action==='replay'?'.txt,.log,.jsonl':'.json'; picker.value=''; picker.click(); }
$('load-config').onclick=()=>pick('config');
$('load-path').onclick=()=>pick('path');
$('load-replay').onclick=()=>pick('replay');
$('save-path').onclick=()=>guarded(()=>{ const text=JSON.stringify({version:1,path:state.path,controls:Object.fromEntries(Object.entries(snapshot().controls).filter(([k])=>k.startsWith('track-')))},null,2); localStorage.setItem('beichen-path',text); download('beichen-path.json',text); statusText('路径和运动参数已保存'); });
$('export-log').onclick=()=>{ download('beichen-log.jsonl',archive.map(x=>JSON.stringify(x)).join('\n'),'application/x-ndjson'); statusText(`已导出 ${archive.length} 条记录（本次会话最多保留 100000 条）`); };
let replay: string[]=[]; let replayTimer=0; let replayIndex=0;
function stopReplay() { clearTimeout(replayTimer); replayTimer=0; ($('replay-run') as HTMLButtonElement).disabled=!replay.length; ($('replay-stop') as HTMLButtonElement).disabled=true; }
picker.onchange=async()=>{
  const file=picker.files?.[0]; if(!file)return;
  if(file.size>32*1024*1024) {statusText('文件超过 32 MB');return;}
  const action=fileAction;
  try { const text=await file.text();
    if(action==='config') {restore(text);localStorage.setItem('beichen-config',text);statusText('配置已导入');}
    else if(action==='path') {const v=JSON.parse(text);validatePath(v.path); setTrack(false); frozenTrackTime=0; state.path=v.path;
      for(const id of controlIds.filter(x=>x.startsWith('track-'))) {const el=$(id) as HTMLInputElement;const value=v.controls?.[id];if(typeof value==='boolean'&&el.type==='checkbox')el.checked=value;else if(typeof value==='string'&&el.type!=='checkbox')el.value=value;}
      localStorage.setItem('beichen-path',text);refreshTrackCoordinates(true);drawMap();statusText(`已导入 ${v.path.length} 个路径点及运动参数`);}
    else {stopReplay();replay=replaySentences(text);replayIndex=0;($('replay-run') as HTMLButtonElement).disabled=false;statusText(`已加载 ${replay.length} 条报文，等待开始回放`);}
  } catch(e) {statusText(e instanceof Error?e.message:String(e));}
};
const replayNetwork=document.createElement('label');replayNetwork.innerHTML='<input type="checkbox" id="replay-network"/> 回放时向网络发送';$('replay-ms').parentElement!.after(replayNetwork);
$('replay-stop').onclick=()=>{stopReplay();statusText(`回放已停止 ${replayIndex}/${replay.length}`);};
$('replay-run').onclick=()=>{
  setRunning(false); stopReplay(); replayIndex=0; ($('replay-run') as HTMLButtonElement).disabled=true; ($('replay-stop') as HTMLButtonElement).disabled=false;
  const network=($('replay-network') as HTMLInputElement).checked;
  const tick=async()=>{
    const sentence=replay[replayIndex++]; pushRow('接收',sentence,'文件回放');
    if(network) { try { const cfg={...netConfig(),sentence}; const result=window.beidou?await window.beidou.send(cfg):await(await fetch('./api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cfg)})).json(); if(result.ok===false||result.tcpError)throw new Error(result.error||result.tcpError);pushRow('发送',sentence,'文件回放网络发送'); }catch(e){stopReplay();statusText(`回放发送失败：${String(e)}`);return;} }
    statusText(`回放 ${replayIndex}/${replay.length}`);
    if(($('replay-stop') as HTMLButtonElement).disabled)return;
    if(replayIndex<replay.length)replayTimer=window.setTimeout(()=>void tick(),Math.max(10,numInput('replay-ms',100)));else stopReplay();
  }; void tick();
};
function mode(simple: boolean) { document.body.classList.toggle('simple',simple);$('mode-simple').setAttribute('aria-pressed',String(simple));$('mode-config').setAttribute('aria-pressed',String(!simple)); }
$('mode-simple').onclick=()=>mode(true);$('mode-config').onclick=()=>mode(false);
$('quick-start').onclick=async()=>{stopReplay();setTrack(false);frozenTrackTime=0;applyDataset('static-rtk');($('udp-on') as HTMLInputElement).checked=true;($('tcp-on') as HTMLInputElement).checked=false;($('use-sys-time') as HTMLInputElement).checked=true;await joinGroup();setRunning(true);};
$('help-content').textContent=helpText;
$('help-open').onclick=()=>($('help-dialog') as HTMLDialogElement).showModal();$('help-close').onclick=()=>($('help-dialog') as HTMLDialogElement).close();
mountStartup();
void nicsReady.then(() => {
try {const saved=localStorage.getItem('beichen-config');if(saved){restore(saved);statusText('已恢复本机配置；发送保持停止');}else {const path=localStorage.getItem('beichen-path');if(path){const v=JSON.parse(path);validatePath(v.path);state.path=v.path;for(const id of controlIds.filter(x=>x.startsWith('track-'))){const el=$(id) as HTMLInputElement;const value=v.controls?.[id];if(typeof value==='boolean'&&el.type==='checkbox')el.checked=value;else if(typeof value==='string'&&el.type!=='checkbox')el.value=value;}refreshTrackCoordinates(true);drawMap();}}}catch{statusText('本机保存的数据不可用，可重新导入');}

void joinGroup();
}).catch(e => statusText(`网卡初始化失败：${String(e)}`));

function coordFormat(): CoordinateFormat { return ($('coord-format') as HTMLSelectElement).value as CoordinateFormat; }
$('map-source').onchange=()=>drawMap();
let previousCoordFormat=coordFormat();
$('coord-format').onchange=()=>{
  const invalid=document.querySelector<HTMLInputElement>('.field input:invalid, #track-lat:invalid, #track-lon:invalid');
  if(invalid){($('coord-format') as HTMLSelectElement).value=previousCoordFormat;invalid.reportValidity();return;}
  previousCoordFormat=coordFormat();refreshDerived();refreshTrackCoordinates();drawMap();renderStream();
};
$('stream-freeze').onclick=()=>{state.streamFrozen=!state.streamFrozen;$('stream-freeze').textContent=state.streamFrozen?'继续刷新':'暂停刷新';if(!state.streamFrozen)renderStream();};
$('stream-clear').onclick=()=>{state.rows=[];renderStream();};
$('opening-preview').onclick=()=>{const el=document.createElement('div');el.id='splash';document.body.appendChild(el);mountStartup();};
window.addEventListener('resize',()=>drawMap());
drawMap();

async function updateFullscreenLabel() {
  const full=window.beidou ? await window.beidou.fullscreen() : Boolean(document.fullscreenElement);
  $('fullscreen-toggle').textContent=full?'退出全屏 · F11':'进入全屏 · F11';
}
$('fullscreen-toggle').onclick=async()=>{
  if(window.beidou) await window.beidou.fullscreen(true);
  else if(document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
  setTimeout(()=>void updateFullscreenLabel(),200);
};
document.addEventListener('fullscreenchange',()=>void updateFullscreenLabel());
window.addEventListener('resize',()=>void updateFullscreenLabel());
void updateFullscreenLabel();

function updateRateHint() {
  const hz=numInput('rate',10);
  $('rate-hint').textContent=hz>0?`${hz} 条/秒 = 每 ${(1000/hz).toFixed(1).replace(/\.0$/,'')} 毫秒发送一条`:'请输入大于 0 的发送频率';
}
$('rate').addEventListener('input',updateRateHint);updateRateHint();

function coordinateInput(token:string,axis:'lat'|'lon'):string {
  const result=token?.trim()?coordinate(Number(token),axis,coordFormat()):'坐标无效';
  return result==='坐标无效'?token??'':result;
}
function setTrackCoordinate(axis:'lat'|'lon',value:number) {
  const el=$('track-'+axis) as HTMLInputElement;
  el.dataset.decimal=String(value);el.dataset.coordFormat=coordFormat();
  el.value=coordinateInput(String(value),axis);el.placeholder=coordFormat()==='dd'?'31.15960455':coordFormat()==='dm'?'31 09.576 N':'31 09 34.576 N';
}
function refreshTrackCoordinates(fromValues=false) {
  for(const axis of ['lat','lon'] as const){const el=$('track-'+axis) as HTMLInputElement;
    let value=Number(fromValues?el.value:el.dataset.decimal??el.value);
    if(!Number.isFinite(value))try{value=parseCoordinate(el.value,axis,(el.dataset.coordFormat??coordFormat()) as CoordinateFormat);}catch{continue;}
    setTrackCoordinate(axis,value);
  }
}
for(const axis of ['lat','lon'] as const){const el=$('track-'+axis) as HTMLInputElement;
  el.addEventListener('input',()=>{try{parseCoordinate(el.value,axis,(el.dataset.coordFormat??coordFormat()) as CoordinateFormat);el.setCustomValidity('');}catch(e){el.setCustomValidity(e instanceof Error?e.message:String(e));}});
  el.addEventListener('change',event=>{try{const value=parseCoordinate(el.value,axis,(el.dataset.coordFormat??coordFormat()) as CoordinateFormat);el.setCustomValidity('');setTrackCoordinate(axis,value);}catch(e){event.stopImmediatePropagation();el.setCustomValidity(e instanceof Error?e.message:String(e));el.reportValidity();}},true);
}
refreshTrackCoordinates(true);
