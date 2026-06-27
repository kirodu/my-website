const MAX_FILE_SIZE = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 130000;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const form = document.querySelector("#imageEditForm");
const imageInput = document.querySelector("#imageInput");
const previewPanel = document.querySelector("#previewPanel");
const sourcePreview = document.querySelector("#sourcePreview");
const clearImageButton = document.querySelector("#clearImageButton");
const submitButton = document.querySelector("#submitButton");
const statusMessage = document.querySelector("#statusMessage");

const emptyResult = document.querySelector("#emptyResult");
const loadingResult = document.querySelector("#loadingResult");
const successResult = document.querySelector("#successResult");
const errorResult = document.querySelector("#errorResult");
const resultImage = document.querySelector("#resultImage");
const downloadResult = document.querySelector("#downloadResult");
const errorText = document.querySelector("#errorText");

let previewUrl = "";

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) {
    clearPreview();
    return;
  }

  const validationError = validateImage(file);
  if (validationError) {
    setStatus(validationError, "error");
    imageInput.value = "";
    clearPreview();
    return;
  }

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  sourcePreview.src = previewUrl;
  previewPanel.hidden = false;
  setStatus("图片已选择，可以开始免费改稿。");
});

clearImageButton.addEventListener("click", () => {
  imageInput.value = "";
  clearPreview();
  setStatus("已清除图片，请重新上传。");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const contact = new FormData(form).get("contact")?.trim();
  const file = imageInput.files?.[0];

  if (!contact) {
    setStatus("请先填写微信号或手机号。", "error");
    return;
  }

  if (!file) {
    setStatus("请上传一张需要改稿的图片。", "error");
    return;
  }

  const validationError = validateImage(file);
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  setLoading(true);
  showPanel("loading");
  setStatus("正在上传并生成，通常需要 60-90 秒，请稍等。");

  try {
    const payload = new FormData(form);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/image-edit", {
        method: "POST",
        body: payload,
        signal: controller.signal
      });

      const result = await parseApiResponse(response);

      if (!response.ok || !result.ok) {
        throw result;
      }

      if (!result.imageUrl && !result.b64Json) {
        throw { code: "image_api_failed", message: "接口没有返回图片，请联系睿睿人工处理。" };
      }

      const imageSrc = result.imageUrl || `data:image/png;base64,${result.b64Json}`;
      resultImage.src = imageSrc;
      downloadResult.href = imageSrc;
      showPanel("success");
      setStatus("生成成功。你可以下载图片，也可以把结果发给睿睿继续优化。", "success");
    } finally {
      window.clearTimeout(timeout);
    }
  } catch (error) {
    const message = getErrorMessage(error?.name === "AbortError" ? { code: "timeout" } : error);
    errorText.textContent = message;
    showPanel("error");
    setStatus(message, "error");
  } finally {
    setLoading(false);
  }
});

function validateImage(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return "图片格式仅支持 png、jpg、jpeg、webp、gif。";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "图片不能超过 10MB。";
  }

  return "";
}

function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = "";
  sourcePreview.removeAttribute("src");
  previewPanel.hidden = true;
}

function setLoading(isLoading) {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "生成中，请稍等..." : "开始免费改稿";
}

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message${type ? ` ${type}` : ""}`;
}

function showPanel(name) {
  emptyResult.hidden = name !== "empty";
  loadingResult.hidden = name !== "loading";
  successResult.hidden = name !== "success";
  errorResult.hidden = name !== "error";
}

async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text().catch(() => "");
  if (response.status === 404 || response.status === 405 || response.status === 501) {
    return {
      ok: false,
      code: "api_route_unavailable",
      message: "当前预览服务没有启用后端接口，请使用项目里的本地 Node 服务或部署到 Vercel 后再生成。"
    };
  }

  return {
    ok: false,
    code: "image_api_failed",
    message: text ? `服务返回异常：${text.slice(0, 120)}` : "服务返回格式异常。"
  };
}

function getErrorMessage(error) {
  const fallback = "生成失败，可联系睿睿人工改稿。";
  const messages = {
    api_route_unavailable: "当前预览服务没有启用后端接口。请用本地 Node 服务打开页面，或部署到 Vercel 后再生成。",
    missing_contact: "请先填写微信号或手机号。",
    invalid_file_type: "图片格式仅支持 png、jpg、jpeg、webp、gif。",
    file_too_large: "图片不能超过 10MB。",
    usage_limit_reached: "这个联系方式已经领取过 1 次免费改稿，可添加微信继续人工优化。",
    config_missing: "系统还没配置生图密钥或次数限制，暂时不能生成。请先配置 .env.local 或 Vercel 环境变量。",
    lead_webhook_failed: "线索保存失败，请稍后再试或直接联系睿睿。",
    image_api_failed: "生成失败，可联系睿睿人工改稿。",
    timeout: "生成等待超时，请稍后重试或联系睿睿人工改稿。"
  };

  return messages[error?.code] || error?.message || fallback;
}
