// Speech-to-text proxy: forwards the uploaded utterance to Groq Whisper
// using the server-held GROQ_API_KEY. Gated on remaining quota but does not
// consume units — the paired `translate` call is what consumes.
import { json, requireUser, requireRemaining, logUsage } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;

  const quotaGate = await requireRemaining(ctx);
  if (quotaGate) return quotaGate;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "missing_file" }, 400);

  const groqForm = new FormData();
  groqForm.append("file", file, "recording.m4a");
  groqForm.append("model", "whisper-large-v3-turbo");
  groqForm.append("response_format", "verbose_json");
  groqForm.append("temperature", "0");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}` },
    body: groqForm,
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: "stt_failed", detail }, 502);
  }

  const data = await res.json();
  await logUsage(ctx, "stt", 0);

  return json({
    text: (data.text ?? "").trim(),
    detectedLanguage: data.language ?? "unknown",
  });
});
