import { OFFICIAL_SENTENCE, type Tokens } from "./gpchc.ts";

export type Dataset = {
  id: string;
  name: string;
  purpose: string;
  fault: boolean;
  motion?: "line" | "circle" | "eight";
  tokens: Tokens;
  checksumOverride?: string;
  extraSentences?: { label: string; sentence: string }[];
};

const DEMO_LAT = "31.15960455";
const DEMO_LON = "121.17847990";

function base(over: Partial<Tokens>): Tokens {
  return {
    header: "$GPCHC",
    week: "2396",
    sow: "372388.00",
    heading: "105.30",
    pitch: "-0.28",
    roll: "0.46",
    gx: "0.12",
    gy: "-0.04",
    gz: "-0.02",
    ax: "-0.0081",
    ay: "-0.0049",
    az: "0.9999",
    lat: DEMO_LAT,
    lon: DEMO_LON,
    alt: "51.34",
    ve: "0.000",
    vn: "0.000",
    vu: "0.000",
    v2d: "0.000",
    nsv1: "28",
    nsv2: "39",
    status: "42",
    age: "1",
    warning: "0000",
    ...over,
  };
}

function course(ve: number, vn: number): { heading: string; ve: string; vn: string; v2d: string } {
  let deg = (Math.atan2(ve, vn) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (deg >= 360) deg -= 360;
  const v = Math.hypot(ve, vn);
  return {
    heading: deg.toFixed(2),
    ve: ve.toFixed(3),
    vn: vn.toFixed(3),
    v2d: v.toFixed(3),
  };
}

const slow = course(1.5, 2.6);
const reverse = course(0, -1);

export const DATASETS: Dataset[] = [
  {
    id: "official",
    name: "协议示例原句",
    purpose: "表内示例原句。Status 61，Warning 0102，校验 *4A。坐标只用这一条示例点。",
    fault: false,
    tokens: base({
      heading: "105.30",
      pitch: "-0.28",
      roll: "0.46",
      gx: "0.12",
      gy: "-0.04",
      gz: "-0.02",
      ax: "-0.0081",
      ay: "-0.0049",
      az: "0.9999",
      ve: "0.014",
      vn: "0.023",
      vu: "0.029",
      v2d: "0.027",
      nsv1: "28",
      nsv2: "39",
      status: "61",
      age: "0",
      warning: "0102",
    }),
  },
  {
    id: "static-rtk",
    name: "静止 RTK 固定解",
    purpose: "卫星状态 4（RTK 稳定解定位定向）+ 系统状态 2（组合导航）。告警 0000，速度为 0，V_2D 与 Ve、Vn 一致。坐标为协议示例点。",
    fault: false,
    tokens: base({
      heading: "90.00",
      pitch: "0.00",
      roll: "0.00",
      gx: "0.00",
      gy: "0.00",
      gz: "0.00",
      ax: "0.0000",
      ay: "0.0000",
      az: "0.9999",
      ve: "0.000",
      vn: "0.000",
      vu: "0.000",
      v2d: "0.000",
      nsv1: "32",
      nsv2: "30",
      status: "42",
      age: "1",
      warning: "0000",
    }),
  },
  {
    id: "slow",
    name: "低速航路",
    purpose: "组合导航。航向取自 atan2(Ve, Vn)，真北为 0、顺时针为正。V_2D 为东向与北向的合速度。坐标为协议示例点。",
    fault: false,
    tokens: base({
      heading: slow.heading,
      pitch: "1.20",
      roll: "-0.40",
      gx: "0.05",
      gy: "0.02",
      gz: "1.10",
      ax: "0.0200",
      ay: "0.0100",
      az: "0.9980",
      ve: slow.ve,
      vn: slow.vn,
      vu: "0.000",
      v2d: slow.v2d,
      nsv1: "29",
      nsv2: "27",
      status: "42",
      age: "2",
      warning: "0000",
    }),
  },
  {
    id: "init",
    name: "初始化/不定位",
    purpose: "Status 00：十位 0 不定位不定向，个位 0 初始化。可见星为 0。",
    fault: false,
    tokens: base({
      heading: "0.00",
      pitch: "0.00",
      roll: "0.00",
      gx: "0.00",
      gy: "0.00",
      gz: "0.00",
      ax: "0.0000",
      ay: "0.0000",
      az: "0.9999",
      ve: "0.000",
      vn: "0.000",
      vu: "0.000",
      v2d: "0.000",
      nsv1: "0",
      nsv2: "0",
      status: "00",
      age: "0",
      warning: "0000",
    }),
  },
  {
    id: "float-age",
    name: "RTK 浮点 + 差分龄期增大",
    purpose: "Status 52：十位 5 RTK 浮点解定位定向，个位 2 组合导航。Age 取 86。龄期单位表内未规定。",
    fault: false,
    tokens: base({
      nsv1: "18",
      nsv2: "16",
      status: "52",
      age: "86",
      warning: "0000",
      ve: "0.014",
      vn: "0.023",
      vu: "0.000",
      v2d: "0.027",
    }),
  },
  {
    id: "ins-gnss",
    name: "纯惯导 + GNSS 中断",
    purpose: "Status 03：不定位不定向 + 纯惯导。Warning bit0 = 1（GNSS模块数据中断）。",
    fault: false,
    tokens: base({
      heading: "105.30",
      ve: "0.014",
      vn: "0.023",
      vu: "0.000",
      v2d: "0.027",
      nsv1: "0",
      nsv2: "0",
      status: "03",
      age: "0",
      warning: "0001",
    }),
  },
  {
    id: "reverse",
    name: "后退行驶",
    purpose: "Warning bit12 = 1。表内写明该位在速度>2km/h 时有效。本条 V_2D = 1.000 m/s = 3.6 km/h，航向 180°，Vn 为负。",
    fault: false,
    tokens: base({
      heading: reverse.heading,
      pitch: "0.00",
      roll: "0.00",
      gx: "0.00",
      gy: "0.00",
      gz: "0.00",
      ax: "0.0000",
      ay: "-0.0500",
      az: "0.9980",
      ve: reverse.ve,
      vn: reverse.vn,
      vu: "0.000",
      v2d: reverse.v2d,
      nsv1: "26",
      nsv2: "24",
      status: "42",
      age: "1",
      warning: "1000",
    }),
  },
  {
    id: "antenna",
    name: "天线异常（主/副 短路或断路）",
    purpose: "Warning 01E0：bit5 主天线短路、bit6 主天线断路、bit7 副天线短路、bit8 副天线断路同时为 1。",
    fault: false,
    tokens: base({
      status: "61",
      warning: "01E0",
      ve: "0.000",
      vn: "0.000",
      vu: "0.000",
      v2d: "0.000",
    }),
  },
  {
    id: "edges",
    name: "边界值（航向 359.99→0，俯仰近 ±90）",
    purpose: "航向 359.99、俯仰 90.00、横滚 -180.00，均在表内范围内。航向再增加 0.01 即为 360.00，超出 0 至 359.99。俯仰 -90 与 +90 同为边界，本条取 +90。",
    fault: false,
    tokens: base({
      heading: "359.99",
      pitch: "90.00",
      roll: "-180.00",
      gx: "0.00",
      gy: "0.00",
      gz: "0.00",
      status: "42",
      warning: "0000",
      ve: "0.000",
      vn: "0.000",
      vu: "0.000",
      v2d: "0.000",
    }),
  },
  {
    id: "fault",
    name: "故障集（错校验、缺字段、超范围）",
    purpose: "故障注入，不是正常输出。主报文航向 400.00、纬度 95、告警 ZZZZ，并强制校验为 00。报文流另有一条缺字段的句子。",
    fault: true,
    checksumOverride: "00",
    tokens: base({
      heading: "400.00",
      lat: "95.00000000",
      warning: "ZZZZ",
      status: "61",
    }),
    extraSentences: [
      {
        label: "缺字段",
        sentence: "$GPCHC,2396,372388.00*00\r\n",
      },
    ],
  },
];

for (const [motion, name] of [["line","直线加速巡航"],["circle","定速圆周转弯"],["eight","8 字交替转弯"]] as const) {
  DATASETS.push({id:`motion-${motion}`,name,purpose:"地图、姿态、速度与输出报文联动。点击开始运动，再开启连续发送进行网络测试。",fault:false,motion,tokens:base({heading:"90.00",pitch:"0.00",roll:"0.00"})});
}

export function officialTokens(): Tokens {
  return DATASETS[0].tokens;
}

export { OFFICIAL_SENTENCE };
