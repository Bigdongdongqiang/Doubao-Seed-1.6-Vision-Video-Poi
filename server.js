/**
 * 本地服务：静态资源 + 豆包 Vision 检测代理
 * 环境变量见 .env（不要提交 .env）
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DOUBAO_ARK_API_KEY = process.env.DOUBAO_ARK_API_KEY || process.env.VOLC_ARK_API_KEY || process.env.ARK_API_KEY || '';
const DOUBAO_ARK_MODEL = process.env.DOUBAO_ARK_MODEL || 'Doubao-Seed-1.6-Vision';

const ARK_CHAT_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const DETECT_PROMPT = `请分析图片，找出图中所有以下目标并用边界框标出：
1. 穿蓝色衣服、戴安全帽的人
2. 笔记本电脑
3. 显示器（电脑显示器、屏幕）
4. 黑色水杯

bbox 为相对图片宽高的比例(0~1)。严禁输出任何解释、分析、说明，只输出纯 JSON 数组。
格式：[{"class":"类别名","score":0.9,"bbox":[left,top,width,height]},...]
class 必须为：穿蓝色衣服戴安全帽的人、笔记本电脑、显示器、黑色水杯 之一。若无任何目标则输出 []`;

function extractJsonArray(text) {
    if (!text || typeof text !== 'string') return null;
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) return codeBlock[1].trim();
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket < 0) return null;
    let depth = 1;
    for (let i = lastBracket - 1; i >= 0; i--) {
        const c = text[i];
        if (c === ']') depth++;
        else if (c === '[') { depth--; if (depth === 0) return text.slice(i, lastBracket + 1); }
    }
    const arrMatch = text.match(/\[\s*\]/);
    return arrMatch ? arrMatch[0] : null;
}

function parseDoubaoPredictions(text, imgWidth, imgHeight) {
    const predictions = [];
    if (!text || typeof text !== 'string') return predictions;
    const jsonStr = extractJsonArray(text);
    if (!jsonStr) return predictions;
    try {
        const arr = JSON.parse(jsonStr);
        if (!Array.isArray(arr)) return predictions;
        for (const o of arr) {
            const bbox = o.bbox || o.box || [];
            const left = (bbox[0] != null ? bbox[0] : 0) * (imgWidth || 640);
            const top = (bbox[1] != null ? bbox[1] : 0) * (imgHeight || 480);
            const width = (bbox[2] != null ? bbox[2] : 0) * (imgWidth || 640);
            const height = (bbox[3] != null ? bbox[3] : 0) * (imgHeight || 480);
            predictions.push({
                class: o.class || o.name || o.label || 'object',
                score: typeof o.score === 'number' ? o.score : 0.9,
                bbox: [left, top, width, height]
            });
        }
    } catch (_) { }
    return predictions;
}

async function doubaoVisionDetect(imageBase64, imgWidth, imgHeight) {
    if (!DOUBAO_ARK_API_KEY) throw new Error('未配置 DOUBAO_ARK_API_KEY');
    const url = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
    const body = {
        model: DOUBAO_ARK_MODEL,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url } },
                    { type: 'text', text: DETECT_PROMPT }
                ]
            }
        ],
        max_tokens: 2048,
        temperature: 0.2
    };
    const res = await fetch(ARK_CHAT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DOUBAO_ARK_API_KEY}`
        },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log('[豆包] 完整返回:', JSON.stringify(data, null, 2));
    if (data.error) throw new Error(data.error.message || data.error.code || '豆包接口错误');
    const text = data.choices?.[0]?.message?.content || '';
    console.log('[豆包] 文本内容:', text);
    const predictions = parseDoubaoPredictions(text, imgWidth, imgHeight);
    return predictions;
}

const MIME = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    if (pathname === '/api/detect-doubao' && req.method === 'POST') {
        if (!DOUBAO_ARK_API_KEY) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: '未配置豆包 API。请在 .env 中设置 DOUBAO_ARK_API_KEY，并在火山方舟创建 Doubao-Seed-1.6-Vision 推理接入点，将端点 ID 设为 DOUBAO_ARK_MODEL。' }));
            return;
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
            const { image, width, height } = JSON.parse(body);
            if (!image) {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '缺少 image 字段（base64）' }));
                return;
            }
            const base64 = image.replace(/^data:image\/\w+;base64,/, '');
            const predictions = await doubaoVisionDetect(base64, width || 640, height || 480);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ predictions }));
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: e.message || '豆包检测失败' }));
        }
        return;
    }

    const filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end();
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end();
            return;
        }
        const ext = path.extname(filePath);
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('服务已启动: http://localhost:' + PORT);
    if (!DOUBAO_ARK_API_KEY) console.log('提示: 未设置 DOUBAO_ARK_API_KEY，豆包 Vision 检测不可用。');
});
