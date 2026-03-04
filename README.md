# 豆包 Doubao-Seed-1.6-Vision 接入说明

本页使用**火山引擎方舟**上的 **Doubao-Seed-1.6-Vision** 对视频帧进行图形标注检测，由本地 Node 服务代理请求。

## 1. 开通与获取 Key

1. 打开 [火山引擎控制台](https://console.volcengine.com/) 并登录。
2. 进入 **火山方舟**（大模型服务）：控制台内搜「方舟」或从产品列表进入。
3. **创建 API Key**：在「API Key 管理」中新建 Key，复制保存。
4. **创建推理接入点**（用 Vision 模型）：
   - 进入「推理接入点」或「在线推理」；
   - 新建接入点，选择 **Doubao-Seed-1.6-Vision**（或名称含 Vision 的豆包 1.6 视觉模型）；
   - 创建完成后得到 **端点 ID**（形如 `ep-xxxxxxxxxx`），复制保存。

## 2. 配置 .env

在项目根目录的 `.env` 中增加：

```env
DOUBAO_ARK_API_KEY=你的火山方舟API_Key
DOUBAO_ARK_MODEL=ep-xxxxxxxxxx
```

- `DOUBAO_ARK_MODEL` 填上一步得到的**端点 ID**，不要填模型名称。
- 也支持 `VOLC_ARK_API_KEY`、`ARK_API_KEY` 作为 Key 的环境变量名。

## 3. 使用方式

1. 启动本地服务：`npm run serve`。
2. 浏览器打开 http://localhost:3000。
3. 选择本地视频或输入视频 URL，播放后即可按帧调用豆包 Vision 做检测并画框。
4. 检测到的疑似帧会出现在下方列表，支持点击放大查看。

未配置 `DOUBAO_ARK_API_KEY` 或 `DOUBAO_ARK_MODEL` 时，豆包检测会提示未配置。

## 4. 检测目标

当前使用**单一合并提示词**，每帧一次请求同时检测以下四类目标：

- 穿蓝色衣服、戴安全帽的人
- 笔记本电脑
- 显示器（电脑显示器、屏幕）
- 黑色水杯

模型返回 JSON 数组（`class` + `score` + `bbox`），后端解析后绘制边界框并统计各类数量。

## 5. 说明

- 豆包 Vision 为**多模态大模型**，通过提示词要求其输出「类别 + 边界框」的 JSON，后端 `extractJsonArray` 与 `parseDoubaoPredictions` 负责解析。
- 若模型返回格式有变化，可在 `server.js` 中调整解析逻辑或 `DETECT_PROMPT` 提示词。
- 调用按火山方舟计费（有免费额度），注意用量。
