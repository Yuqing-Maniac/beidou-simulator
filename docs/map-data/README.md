# 四区域离线地图数据

北辰内置四份 OpenStreetMap（OSM）小范围简化矢量摘录，分别覆盖北京天安门周边、达茂旗百灵庙镇中心、湛江市赤坎城区中心、广州市中心各约 2–3 公里范围。并非四地全行政区域，也不是由任意位置平移得到的合成底图。图形与模拟坐标都使用 WGS84；不使用有偏移的网络底图，不对模拟经纬度加偏移。

这些摘录包含原始 OSM 道路、部分水体、绿地和铁路。OSM 的覆盖程度因地区而异，不能承诺所有建筑、支路、水体完整；本项目有意省略建筑、细小路径和复杂关系，以便离线模拟测试。超出摘录边界的区域没有地理底图，不应把空白解释为该位置没有道路。原有仿真试验场仍可以单独使用。

## 数据来源与许可

- 地图数据：**© OpenStreetMap contributors**。
- 数据库许可：[Open Data Commons Open Database License 1.0（ODbL）](https://opendatacommons.org/licenses/odbl/1-0/)。
- OSM 版权及贡献者说明：[https://www.openstreetmap.org/copyright](https://www.openstreetmap.org/copyright)。
- 数据请求方式：OSM 正式 Map API `https://api.openstreetmap.org/api/0.6/map?bbox=west,south,east,north`，仅请求四个小范围摘录；不抓取公共栅格瓦片。
- 许可证全文见本目录 `ODbL-1.0.txt`（从 GitHub choosealicense.com 的标准 ODbL-1.0 文本取得）。
- 每份 `src/map-data/*.json` 内含完整请求 URL、源数据对象的最新修改时间、获取时间、许可证标识及每条图形的 OSM way ID，便于追溯。
- 这些 JSON 文件是源 OSM 数据的简化摘录，按 ODbL 1.0 提供。软件代码的许可不替代地图数据库的许可。发布时须保留图中署名、此说明及地图数据源；修改并公开使用地图数据库时须遵守 ODbL 的相同方式共享要求。原始数据库也可从 OSM 获取。

## 更新方式

`python scripts/fetch-offline-maps.py` 从公开 API 获取上述四个范围，按确定规则筛选道路/水体/绿地/铁路、裁切边界，并做约 4–6 米的几何简化与六位坐标舍入。这个脚本是开发者主动执行的维护工具，软件启动、正常构建和地图切换不会请求互联网。生产构建将 JSON 懒加载为本地 JS 分块，因此 `file://` 桌面应用也不依赖 Fetch 对文件协议的支持。

开发者若需要更大的范围，建议从 OSM 区域数据提供方下载合适的公开摘录，在本地裁切，而不要对公共瓦片服务做批量下载。
