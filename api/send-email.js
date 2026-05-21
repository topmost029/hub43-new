// api/send-email.js — Vercel Serverless Function
// Relays transactional emails to ZeptoMail from the server side (no CORS issues).
// Deploy this repo to Vercel and set ZEPTO_TOKEN + ZEPTO_FROM_ADDRESS in
// Project → Settings → Environment Variables.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.ZEPTO_TOKEN;
  const fromAddress = process.env.ZEPTO_FROM_ADDRESS;
  const fromName = process.env.ZEPTO_FROM_NAME || "Hub43 Workspace";

  if (!token || !fromAddress) {
    console.error("ZeptoMail env vars not set: ZEPTO_TOKEN / ZEPTO_FROM_ADDRESS");
    return res.status(500).json({ ok: false, error: "Email service not configured" });
  }

  const { to_email, to_name, subject, htmlbody, textbody } = req.body || {};

  if (!to_email || !subject) {
    return res.status(400).json({ ok: false, error: "Missing to_email or subject" });
  }

  const payload = {
    from: { address: fromAddress, name: fromName },
    to: [{ email_address: { address: to_email, name: to_name || to_email } }],
    subject,
    htmlbody: htmlbody || `<p>${(textbody || "").replace(/\n/g, "<br/>")}</p>`,
    textbody: textbody || "",
  };

  try {
    const zeptoRes = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": token,          // ZeptoMail "Send Mail Token" — starts with "Zoho-enczapikey …"
      },
      body: JSON.stringify(payload),
    });

    const zeptoBody = await zeptoRes.json().catch(() => ({}));

    if (!zeptoRes.ok) {
      console.error("ZeptoMail error", zeptoRes.status, zeptoBody);
      return res.status(502).json({ ok: false, error: zeptoBody?.message || "ZeptoMail error", status: zeptoRes.status });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("send-email handler error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
