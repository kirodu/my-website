# 睿睿增长工作室官网

这是一个可部署到 Vercel 的静态官网 + Serverless API 项目，包含：

- `index.html`：首页内容、SEO 标签、结构化数据
- `diagnosis.html`：个人业务官网诊断表，可打印/另存 PDF
- `content-calendar.html`：30 条新媒体获客选题清单，可打印/另存 PDF
- `image-editor.html`：AI 招生海报改稿器，公开引流用图生图工具
- `api/image-edit.js`：Vercel Serverless 图生图代理接口
- `styles.css`：首页响应式视觉样式
- `diagnosis.css` / `resource.css`：资料页样式
- `image-editor.css` / `image-editor.js`：生图工具样式和交互
- `script.js`：官网诊断表交互
- `robots.txt`：搜索爬虫规则
- `sitemap.xml`：站点地图，上线后替换域名
- `llms.txt`：给 AI 搜索和大模型读取的站点说明
- `favicon.svg`：网站图标

上线前建议替换：

- 微信号、二维码、邮箱
- `https://your-domain.example/` 为真实域名
- 真实案例截图和客户成果
- 诊断表下载链接或表单链接
- `.env.example` 中的 `XIAOJI_API_KEY`、`LEAD_WEBHOOK_URL`、`KV_REST_API_URL`、`KV_REST_API_TOKEN`

本地静态预览地址：

- 首页：`http://127.0.0.1:5178/`
- 官网诊断表：`http://127.0.0.1:5178/diagnosis.html`
- 30 条获客选题：`http://127.0.0.1:5178/content-calendar.html`
- AI 招生海报改稿器：`http://127.0.0.1:5178/image-editor.html`

Vercel 开发预览：

1. 运行 `npm install`
2. 复制 `.env.example` 为 `.env.local` 并填入真实配置
3. 运行 `npx vercel dev`
4. 打开 `http://localhost:3000/image-editor.html`

注意：`XIAOJI_API_KEY`、Webhook 和 KV 凭据只能放在服务端环境变量中，不能写进前端页面。
