import test from "node:test";
import assert from "node:assert/strict";
import { server } from "./server.mjs";
test("image edits carry source image; page reviews remain structured suggestions (mock upstream)", async () => {
  const realFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith("https://api.openai.com/")) {
      calls.push({ url, options });
      return String(url).endsWith("/responses")
        ? Response.json({
            status: "completed",
            output: [
              {
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      summary: "Needs human inspection.",
                      findings: [],
                    }),
                  },
                ],
              },
            ],
          })
        : Response.json({ data: [{ b64_json: "AQID" }] });
    }
    return realFetch(url, options);
  };
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port,
    headers = {
      "Content-Type": "application/json",
      "x-openai-key": "mock-key",
    };
  try {
    const image = "data:image/png;base64,AQID";
    let r = await fetch(base + "/api/image", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image,
        prompt: "Keep the route; face right.",
        ratio: 1.4,
      }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).image, image);
    assert.ok(calls[0].options.body instanceof FormData);
    assert.ok(calls[0].options.body.get("image") instanceof Blob);
    r = await fetch(base + "/api/review", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image,
        context: [{ id: "P02", brief: "Travel right." }],
      }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).summary, "Needs human inspection.");
    const review = JSON.parse(calls[1].options.body);
    assert.equal(review.input[0].content[1].image_url, image);
    assert.equal(review.store, false);
    r = await fetch(base + "/api/image", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image,
        prompt: "Keep the subject and use the palette.",
        references: [{ image, name: "Palette", role: "Colour only" }],
      }),
    });
    assert.equal(r.status, 200);
    const multipart = calls.at(-1).options.body;
    assert.equal(multipart.getAll("image[]").length, 2);
    assert.match(multipart.get("prompt"), /2: Palette.*Colour only/);
    r = await fetch(base + "/api/image", {
      method: "POST",
      headers,
      body: '{"prompt":""}',
    });
    assert.equal(r.status, 400);
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((r) => server.close(r));
  }
});
