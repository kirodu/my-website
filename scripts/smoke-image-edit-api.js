const handler = require("../api/image-edit");

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

async function main() {
  delete process.env.XIAOJI_API_KEY;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  const req = { method: "POST" };
  const res = createResponse();

  await handler(req, res);

  if (res.statusCode !== 500) {
    throw new Error(`Expected status 500, got ${res.statusCode}`);
  }

  if (res.body?.code !== "image_api_failed") {
    throw new Error(`Expected image_api_failed, got ${res.body?.code}`);
  }

  console.log("Image edit API smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
