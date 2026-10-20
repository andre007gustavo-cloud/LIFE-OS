// api/chat.js — Vercel Serverless Function
// Desligado em 19/10/2026: o assistente do Life OS agora é o Jarvis (página privada no
// PC do André). Este proxy chamava a API paga da Anthropic; respondendo 410 sem chamar
// nada, não gasta mesmo que a ANTHROPIC_API_KEY ainda esteja na Vercel.
export default function handler(req, res) {
  return res.status(410).json({
    error: { message: 'Assistente desligado: use o Jarvis (botão Assistente).' },
  });
}
