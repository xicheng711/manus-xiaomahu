import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually
try {
  const envContent = readFileSync(resolve('/home/ubuntu/dementia-care/.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
  }
} catch {}

const apiKey = process.env.GEMINI_API_KEY;
console.log('Key present:', !!apiKey, '| Length:', apiKey?.length ?? 0);

if (!apiKey) {
  console.error('No GEMINI_API_KEY found!');
  process.exit(1);
}

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: '用中文说你好' }] }] }),
  }
);
const data = await res.json();
console.log('Status:', res.status);
console.log('Response:', JSON.stringify(data).slice(0, 400));
