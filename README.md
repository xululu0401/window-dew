# 早上窗台上那摊水（window-dew）

冬天玻璃一夜挂满水：填玻璃、窗帘、室温湿度和夜里外面多冷，逐 10 分钟推一晚，看几点开始起雾、起床时积多少水、改哪一样能不结露。

- 单页静态应用：`index.html` + `core.js`（计算）+ `ui.js`（界面），不联网、不收集数据，条件只存在本机 localStorage。
- 模型：一维稳态传热（玻璃中部）+ Magnus 露点 + 刘易斯类比粗估凝结量。粗估，不是实测；不算窗框窗角、呼吸加湿、开窗与除湿。
- 测试：`node --test tests/core.test.cjs`；独立 Python 参考实现 `tests/ref.py` 生成 `tests/ref.json`（300 组）。
- 默认数字是虚构示例。
