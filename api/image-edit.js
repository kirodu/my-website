const crypto = require("node:crypto");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const ALLOWED_TEMPLATES = new Set(["招生海报优化", "小红书封面优化", "朋友圈课程海报优化"]);
const ALLOWED_PLATFORMS = new Set(["小红书", "朋友圈", "公众号", "抖音图文"]);
const XIAOJI_IMAGE_EDIT_URL = "https://xiaoji.baziapi.site/v1/images/edits";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    sendError(res, 405, "invalid_request", "只支持 POST 请求。");
    return;
  }

  if (!process.env.XIAOJI_API_KEY) {
    sendError(res, 500, "config_missing", "系统未配置生图接口密钥，请联系站点管理员。");
    return;
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    sendError(res, 500, "config_missing", "系统未配置次数限制，暂时不能公开生成，避免接口被刷。");
    return;
  }

  let parsed;
  try {
    parsed = await parseMultipartRequest(req);
  } catch (error) {
    sendError(res, error.status || 400, error.code || "invalid_request", error.message || "请求格式不正确。");
    return;
  }

  const { fields, imageFile } = parsed;
  const contact = normalizeField(fields.contact);
  const leadName = normalizeField(fields.leadName) || "未填写";
  const courseType = normalizeField(fields.courseType);
  const platform = normalizeField(fields.platform) || "小红书";
  const template = normalizeField(fields.template) || "招生海报优化";
  const notes = normalizeField(fields.notes);

  if (!contact) {
    sendError(res, 400, "missing_contact", "请先填写微信号或手机号。");
    return;
  }

  if (!imageFile) {
    sendError(res, 400, "invalid_file_type", "请上传一张需要改稿的图片。");
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(imageFile.mimetype)) {
    sendError(res, 400, "invalid_file_type", "图片格式仅支持 png、jpg、jpeg、webp、gif。");
    return;
  }

  if (imageFile.buffer.length > MAX_FILE_SIZE) {
    sendError(res, 413, "file_too_large", "图片不能超过 10MB。");
    return;
  }

  if (!ALLOWED_TEMPLATES.has(template)) {
    sendError(res, 400, "invalid_request", "改稿模板不正确。");
    return;
  }

  if (!ALLOWED_PLATFORMS.has(platform)) {
    sendError(res, 400, "invalid_request", "目标平台不正确。");
    return;
  }

  const contactHash = hashContact(contact);
  const usageKey = `image-edit:${contactHash}`;
  let usageReserved = false;

  try {
    const currentUsage = await kvCommand(["GET", usageKey]);
    if (currentUsage) {
      sendError(res, 429, "usage_limit_reached", "这个联系方式已经领取过 1 次免费改稿，可添加微信继续人工优化。");
      return;
    }

    await kvCommand(["SET", usageKey, "pending", "EX", "900"]);
    usageReserved = true;

    const leadSaved = await pushLead({
      leadName,
      contact,
      courseType,
      platform,
      template,
      notes,
      contactHash,
      status: "submitted",
      createdAt: new Date().toISOString()
    });

    if (!leadSaved) {
      await releaseUsage(usageKey);
      usageReserved = false;
      sendError(res, 502, "lead_webhook_failed", "线索保存失败，请稍后再试或直接联系睿睿。");
      return;
    }

    const prompt = buildPrompt({ courseType, platform, template, notes });
    const imageResult = await callImageEditApi({ imageFile, prompt });

    await kvCommand(["SET", usageKey, "used"]);
    usageReserved = false;

    res.status(200).json({
      ok: true,
      imageUrl: imageResult.imageUrl,
      b64Json: imageResult.b64Json,
      leadSaved
    });
  } catch (error) {
    if (usageReserved) {
      await releaseUsage(usageKey);
    }

    const isTimeout = error.name === "AbortError" || error.code === "timeout";
    sendError(
      res,
      isTimeout ? 504 : 502,
      isTimeout ? "timeout" : "image_api_failed",
      isTimeout ? "生成等待超时，请稍后重试或联系睿睿人工改稿。" : error.message || "生图接口调用失败。"
    );
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendError(res, status, code, message) {
  res.status(status).json({ ok: false, code, message });
}

async function parseMultipartRequest(req) {
  const contentType = req.headers["content-type"] || req.headers["Content-Type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if (!boundaryMatch) {
    throw createHttpError(400, "invalid_request", "请求必须使用 multipart/form-data。");
  }

  const body = await readRequestBody(req);
  if (body.length > MAX_FILE_SIZE + 1024 * 1024) {
    throw createHttpError(413, "file_too_large", "请求体过大，图片不能超过 10MB。");
  }

  return parseMultipartBody(body, boundaryMatch[1] || boundaryMatch[2]);
}

function readRequestBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body));

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_FILE_SIZE + 1024 * 1024) {
        reject(createHttpError(413, "file_too_large", "请求体过大，图片不能超过 10MB。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartBody(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  let imageFile = null;
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryStart = body.indexOf(delimiter, cursor);
    if (boundaryStart === -1) break;

    const partStart = boundaryStart + delimiter.length;
    const nextBoundary = body.indexOf(delimiter, partStart);
    if (nextBoundary === -1) break;

    let part = body.subarray(partStart, nextBoundary);
    part = trimPartBreaks(part);
    cursor = nextBoundary;

    if (part.length === 0 || part.equals(Buffer.from("--"))) continue;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;

    const rawHeaders = part.subarray(0, headerEnd).toString("utf8");
    const value = stripTrailingBreak(part.subarray(headerEnd + 4));
    const headers = parsePartHeaders(rawHeaders);
    const disposition = parseContentDisposition(headers["content-disposition"] || "");

    if (!disposition.name) continue;

    if (disposition.filename) {
      imageFile = {
        fieldName: disposition.name,
        originalFilename: disposition.filename,
        mimetype: headers["content-type"] || "application/octet-stream",
        buffer: value
      };
      continue;
    }

    fields[disposition.name] = value.toString("utf8").trim();
  }

  return { fields, imageFile };
}

function trimPartBreaks(part) {
  let output = part;
  if (output.subarray(0, 2).toString() === "\r\n") output = output.subarray(2);
  if (output.subarray(output.length - 2).toString() === "\r\n") output = output.subarray(0, output.length - 2);
  return output;
}

function stripTrailingBreak(buffer) {
  if (buffer.subarray(buffer.length - 2).toString() === "\r\n") {
    return buffer.subarray(0, buffer.length - 2);
  }
  return buffer;
}

function parsePartHeaders(rawHeaders) {
  const headers = {};
  for (const line of rawHeaders.split("\r\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function parseContentDisposition(value) {
  const result = {};
  for (const segment of value.split(";")) {
    const [rawKey, ...rawValue] = segment.trim().split("=");
    if (!rawKey || rawValue.length === 0) continue;
    result[rawKey] = rawValue.join("=").replace(/^"|"$/g, "");
  }
  return result;
}

function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hashContact(contact) {
  return crypto.createHash("sha256").update(contact.trim().toLowerCase()).digest("hex");
}

async function kvCommand(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error("次数限制服务不可用。");
  }

  const payload = await response.json();
  return payload.result;
}

async function releaseUsage(key) {
  try {
    await kvCommand(["DEL", key]);
  } catch (_) {
    // Best effort cleanup. A pending key expires automatically.
  }
}

async function pushLead(lead) {
  if (!process.env.LEAD_WEBHOOK_URL) return false;

  const response = await fetch(process.env.LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      msg_type: "text",
      content: {
        text: [
          "AI招生海报改稿线索",
          `称呼：${lead.leadName}`,
          `联系方式：${lead.contact}`,
          `课程类型：${lead.courseType || "未填写"}`,
          `目标平台：${lead.platform}`,
          `改稿模板：${lead.template}`,
          `补充需求：${lead.notes || "无"}`,
          `状态：${lead.status}`,
          `时间：${lead.createdAt}`,
          `联系Hash：${lead.contactHash}`
        ].join("\n")
      }
    })
  });

  return response.ok;
}

function buildPrompt({ courseType, platform, template, notes }) {
  const templatePrompt = {
    招生海报优化: "把参考图改成更适合课程招生转化的海报，强化课程价值、报名动机、清晰层级和可信专业感。",
    小红书封面优化: "把参考图改成更适合小红书封面的视觉，标题醒目、构图干净、信息强对比、适合手机端滑动停留。",
    朋友圈课程海报优化: "把参考图改成适合朋友圈传播的课程海报，视觉亲和、信息清楚、突出限时体验和咨询引导。"
  }[template];

  return [
    "你是一名熟悉培训招生、新媒体获客和中文海报设计的视觉设计师。",
    templatePrompt,
    `课程类型：${courseType || "未填写，请根据原图判断"}`,
    `目标平台：${platform}`,
    `用户补充需求：${notes || "无"}`,
    "请保持原图中可识别的课程主题和核心信息，不要虚构具体价格、二维码、电话、学校资质或无法确认的承诺。",
    "画面要适合中国本地培训招生使用，中文排版清晰，高级但不夸张，避免文字过密。",
    "输出一张完整成品图，尺寸按 1024x1024 构图。"
  ].join("\n");
}

async function callImageEditApi({ imageFile, prompt }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const formData = new FormData();
    formData.append("model", "gpt-image-2");
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");
    formData.append("response_format", "url");
    formData.append("image", new Blob([imageFile.buffer], { type: imageFile.mimetype }), imageFile.originalFilename || "poster.png");

    const response = await fetch(XIAOJI_IMAGE_EDIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.XIAOJI_API_KEY}`
      },
      body: formData,
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload?.error?.message || "上游生图接口返回错误。";
      throw new Error(message);
    }

    const firstImage = Array.isArray(payload.data) ? payload.data[0] : null;
    if (!firstImage?.url && !firstImage?.b64_json) {
      throw new Error("生图接口没有返回图片。");
    }

    return {
      imageUrl: firstImage.url || undefined,
      b64Json: firstImage.b64_json || undefined
    };
  } finally {
    clearTimeout(timeout);
  }
}
