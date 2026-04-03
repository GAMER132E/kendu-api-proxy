// ═══════════════════════════════════════════════════════
// KENDU API PROXY SERVER
// Deploy this on Railway, Render, or Vercel
// ═══════════════════════════════════════════════════════
//
// SETUP:
// 1. npm init -y
// 2. npm install express cors
// 3. Set environment variables:
//    - ANTHROPIC_API_KEY = your Anthropic API key
//    - ADMIN_SECRET = kendu-admin-2025  (same as in index.html)
//    - PORT = 3000 (optional)
//
// DEPLOY TO RENDER (free):
// 1. Push this file to a GitHub repo
// 2. Go to render.com → New Web Service → connect your repo
// 3. Set env vars above
// 4. Deploy — you'll get a URL like https://kendu-api-proxy.onrender.com
// 5. Update PROXY_URL in index.html to match your URL
// ═══════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // Allow requests from any origin (your website)
app.use(express.json());

// ─── Key Store ───────────────────────────────────────────
// In production, replace this with a real database (e.g. MongoDB, Supabase, Redis)
// For launch, this in-memory set works fine — just note it resets on server restart
const validKeys = new Set();

// ─── Register a new key ──────────────────────────────────
// Called by your website when a user signs up or generates a free key
app.post('/register-key', (req, res) => {
  const { key, secret } = req.body;

  // Verify the admin secret so only your website can register keys
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Invalid key' });
  }

  validKeys.add(key);
  console.log(`✓ Key registered: ${key.slice(0, 18)}...`);
  res.json({ ok: true, message: 'Key registered successfully' });
});

// ─── List all registered keys (admin only) ───────────────
app.get('/admin/keys', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ count: validKeys.size, keys: [...validKeys] });
});

// ─── Health check ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    service: 'Kendu API Proxy',
    keys_loaded: validKeys.size,
    timestamp: new Date().toISOString()
  });
});

// ─── Get available models ────────────────────────────────
app.get('/v1/models', (req, res) => {
  const key = req.headers['x-api-key'];
  if (!key || !validKeys.has(key)) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  res.json({
    models: [
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku', context: '200k', tier: 'fast' },
      { id: 'claude-sonnet-4-5-20251022', name: 'Claude Sonnet', context: '200k', tier: 'powerful' }
    ]
  });
});

// ─── Main chat endpoint ───────────────────────────────────
app.post('/v1/chat', async (req, res) => {
  // 1. Validate the Kendu API key
  const key = req.headers['x-api-key'];
  if (!key || !validKeys.has(key)) {
    return res.status(401).json({ error: 'Invalid or missing API key. Get your key at kendu.online' });
  }

  // 2. Extract request params
  const { messages, system, model, temperature, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // 3. Choose model (default to Haiku for speed)
  const selectedModel = model || 'claude-haiku-4-5-20251001';

  try {
    // 4. Call Anthropic API with YOUR key (hidden server-side)
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: max_tokens || 1024,
        system: system || 'You are Kendu AI, a helpful and intelligent assistant. Built by Aditya Desale from Thane, India.',
        messages,
        ...(temperature !== undefined && { temperature })
      })
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic error:', data);
      return res.status(anthropicRes.status).json({ error: data.error?.message || 'Upstream API error' });
    }

    // 5. Return clean response
    const reply = data.content?.[0]?.text || '';
    res.json({
      reply,
      model: data.model,
      usage: {
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      finish_reason: data.stop_reason
    });

    console.log(`✓ Request served | key: ${key.slice(0,14)}... | model: ${selectedModel} | tokens: ${data.usage?.output_tokens}`);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Start server ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║       KENDU API PROXY SERVER         ║
║  Built by Aditya Desale, Thane 🇮🇳   ║
╠══════════════════════════════════════╣
║  Status:  RUNNING on port ${PORT}        ║
║  POST /v1/chat   — main endpoint     ║
║  POST /register-key — key signup     ║
║  GET  /health    — status check      ║
╚══════════════════════════════════════╝
  `);
});
