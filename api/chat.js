// api/chat.js — Vercel Serverless Function
// Proxy seguro para a API da Anthropic. A chave fica na env var ANTHROPIC_API_KEY
// (Settings → Environment Variables na Vercel) e NUNCA é exposta ao client.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await apiResp.json();
    return res.status(apiResp.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
