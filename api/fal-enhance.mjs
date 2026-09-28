import { fal } from "@fal-ai/client";

const MODEL = "fal-ai/image-apps-v2/portrait-enhance";

function send(res, status, body) {
  res.status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(body));
}

function isImageDataUri(value) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value);
}

async function toDataUri(image) {
  if (typeof image === "string" && image.startsWith("data:image/")) {
    return image;
  }

  const url = typeof image === "string" ? image : image?.url;
  if (!url) throw new Error("fal.ai returned no enhanced image.");

  const media = await fetch(url);
  if (!media.ok) {
    throw new Error(`Unable to retrieve enhanced image (${media.status}).`);
  }

  const mime = media.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await media.arrayBuffer());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204)
      .setHeader("Access-Control-Allow-Origin", "*")
      .setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type")
      .end();
    return;
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  if (!process.env.FAL_KEY) {
    return send(res, 503, { error: "FAL_KEY is not configured on the server." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const imageUrl = String(body.image_url || body.image || "").trim();

    if (!isImageDataUri(imageUrl)) {
      return send(res, 400, { error: "Expected a base64 image data URI." });
    }

    fal.config({ credentials: process.env.FAL_KEY });

    const result = await fal.subscribe(MODEL, {
      input: {
        image_url: imageUrl
      }
    });

    const output = result?.data?.images?.[0];
    const enhancedDataUri = await toDataUri(output);

    return send(res, 200, {
      image_url: enhancedDataUri,
      request_id: result.requestId || null,
      model: MODEL
    });
  } catch (error) {
    console.error("fal.ai portrait enhancement failed", error);
    return send(res, 502, {
      error: error?.message || "fal.ai enhancement failed."
    });
  }
}
