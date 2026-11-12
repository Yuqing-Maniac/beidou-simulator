# 北辰 · 导航模拟器

本地查看华测 `$GPCHC` ASCII 报文。界面按协议表逐项列出字段、范围、线上原文、校验和告警位。默认通过 UDP 组播发到 `224.100.100.1:6020`。

协议表是字段含义的依据。表里没写的单位或范围，界面标成「未规定」。发送率默认 10 Hz，标成「工具建议」。

## 运行

```bash
npm install
npm test
npm start
```

浏览器打开 http://127.0.0.1:43123 。

`npm start` 同时提供页面和组播收发。桌面包装的是同一套页面，组播走 Electron 主进程，不经过这个 HTTP 接口。

测试包版本是 `0.5.0-test`。银河麒麟 V10 x86_64 用 Electron 22（主程序最高依赖 GLIBC_2.17）。UDP 与 TCP 可同时打开。轨迹页是离线格网。

```bash
npm run pack:linux
npm run pack:win
```

新增快速测试／完整配置、启动动画、本机配置与路径存档、JSON 导入导出、JSONL 日志、报文文件回放及简化加速转弯模型。详细说明可在界面点击“使用说明”，或查看 `docs/guide.txt`。

Windows 64 位测试包在 [v0.5.0-test Release](https://github.com/Yuqing-Maniac/beidou-simulator/releases/tag/v0.5.0-test) 下载：便携 EXE 双击运行，或将 ZIP 完整解压后运行其中的 `beidou-simulator.exe`。

0.5.0-test：司南罗盘启动动画与启动音、场景／地图合并、离线仿真场地底图、同网卡组播和单播双发、固定高度报文流，以及三种经纬度显示格式。保留完整 Electron 运行时，优先保证兼容性。

语音教程：顶部“语音教程”可打开 24 章离线中文讲解、逐步定位与结果检查。“使用说明”支持搜索章节和下载约 1.4 万字完整教程。全部音频随软件打包，不依赖系统中文语音包；教程不会自动改参数或发报。教程内容与维护流程见 `docs/tutorial.txt` 和 `docs/TUTORIAL_AUTHORING.txt`。
