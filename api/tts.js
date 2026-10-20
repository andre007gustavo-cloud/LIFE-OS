// api/tts.js — Vercel Serverless Function
// Desligado em 19/10/2026 junto com o assistente (ver api/chat.js). Chamava o ElevenLabs
// (pago); respondendo 410 sem chamar nada, não gasta mesmo com a chave ainda na Vercel.
export default function handler(req, res) {
  return res.status(410).json({ error: 'Voz do assistente desligada: use o Jarvis.' });
}
