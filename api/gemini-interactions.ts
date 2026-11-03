import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUser } from "./lib/storage.js";

const GOOGLE_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  try {
    // The browser talks only to this same-origin endpoint. The Gemini key is
    // forwarded server-to-server and is never stored by VoiceMaster.
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: "יש להתחבר כדי ליצור קריינות" });

    const apiKey = String(req.headers["x-goog-api-key"] || "").trim();
    if (!apiKey) return res.status(400).json({ error: "Missing Gemini API key" });

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object" || typeof body.model !== "string" ||
          !/^gemini-[a-zA-Z0-9.-]+$/.test(body.model)) {
        return res.status(400).json({ error: "Invalid Gemini interaction payload" });
      }

      const upstream = await fetch(GOOGLE_INTERACTIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
      const responseBody = await upstream.text();
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      return res.send(responseBody);
    }

    if (req.method === "GET") {
      const idValue = req.query.id;
      const id = Array.isArray(idValue) ? idValue[0] : idValue;
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
        return res.status(400).json({ error: "Invalid interaction id" });
      }

      const upstream = await fetch(`${GOOGLE_INTERACTIONS_URL}/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "x-goog-api-key": apiKey },
        cache: "no-store",
      });
      const responseBody = await upstream.text();
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
      return res.send(responseBody);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    console.error("[VoiceMaster][gemini-interactions]", error?.message || error);
    return res.status(500).json({ error: "שגיאה בתקשורת עם שירות הקריינות" });
  }
}
