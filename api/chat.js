// api/chat.js — Vercel Serverless Function
// Proxy seguro para a API da Anthropic. A chave fica na env var ANTHROPIC_API_KEY
// (Settings → Environment Variables na Vercel) e NUNCA é exposta ao client.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Aparar espaços/quebras de linha que costumam vir colados junto da chave
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'ANTHROPIC_API_KEY não está configurada na Vercel (Production). Adicione a chave e faça um novo deploy.' },
    });
  }
  try {
    const apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
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
