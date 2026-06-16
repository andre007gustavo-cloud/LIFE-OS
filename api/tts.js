// api/tts.js — Vercel Serverless Function (proxy ElevenLabs TTS)
// A chave fica só na env var ELEVENLABS_API_KEY (Vercel) e NUNCA vai ao client.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Texto vazio' });
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // fallback
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const apiResp = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': (process.env.ELEVENLABS_API_KEY || '').trim(),
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2', // bom pra português
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return res.status(apiResp.status).json({ error: errText });
    }

    const arrayBuffer = await apiResp.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
