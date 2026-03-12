'use strict';

const express      = require('express');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const nodemailer   = require('nodemailer');
const path         = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── 환경 설정 ──────────────────────────────────────────────────────
const TEAM_PASSWORD  = process.env.TEAM_PASSWORD || 'domino2024';
const AUTH_SECRET    = process.env.AUTH_SECRET   || 'inv-secret-2024';
const ORDER_TO_EMAIL = 'jiyeon.jung0727@gmail.com';
const STORE_NAME     = '도미노피자';
const COOKIE_NAME    = 'inv_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7일

// ── 초기 재고 데이터 (domino_inventory_training.xlsx 기준) ──────────
function calcItem(item) {
  const cur      = Number(item.currentStock) || 0;
  const safe     = Number(item.safetyStock)  || 0;
  const moq      = Number(item.moq)          || 0;
  const shortage = Math.max(0, safe - cur);
  const orderQty = shortage > 0 ? Math.max(moq, shortage) : 0;
  return { ...item, currentStock: cur, shortage, orderQty, status: shortage > 0 ? '발주 필요' : '정상' };
}

const INITIAL_INVENTORY = [
  { code:'ING001', name:'도우볼',       spec:'220g',  unit:'개', currentStock:120, safetyStock:180, moq:100, supplierName:'도미노푸드서플라이', supplierEmail:'liszzm@naver.com', leadDays:2 },
  { code:'ING002', name:'토마토소스',   spec:'3kg',   unit:'팩', currentStock:32,  safetyStock:20,  moq:10,  supplierName:'도미노푸드서플라이', supplierEmail:'liszzm@naver.com', leadDays:2 },
  { code:'ING003', name:'모짜렐라치즈', spec:'2kg',   unit:'봉', currentStock:12,  safetyStock:18,  moq:10,  supplierName:'도미노푸드서플라이', supplierEmail:'liszzm@naver.com', leadDays:2 },
  { code:'ING004', name:'페퍼로니',     spec:'1kg',   unit:'팩', currentStock:15,  safetyStock:12,  moq:8,   supplierName:'프레시미트코리아',   supplierEmail:'liszzm@naver.com', leadDays:3 },
  { code:'ING005', name:'베이컨',       spec:'1kg',   unit:'팩', currentStock:6,   safetyStock:10,  moq:10,  supplierName:'프레시미트코리아',   supplierEmail:'liszzm@naver.com', leadDays:3 },
  { code:'ING006', name:'양파',         spec:'5kg',   unit:'봉', currentStock:14,  safetyStock:12,  moq:6,   supplierName:'그린베지유통',       supplierEmail:'liszzm@naver.com', leadDays:1 },
  { code:'ING007', name:'피망',         spec:'5kg',   unit:'봉', currentStock:5,   safetyStock:8,   moq:5,   supplierName:'그린베지유통',       supplierEmail:'liszzm@naver.com', leadDays:1 },
  { code:'ING008', name:'양송이버섯',   spec:'2.5kg', unit:'캔', currentStock:3,   safetyStock:6,   moq:6,   supplierName:'그린베지유통',       supplierEmail:'liszzm@naver.com', leadDays:1 },
  { code:'ING009', name:'블랙올리브',   spec:'3kg',   unit:'캔', currentStock:9,   safetyStock:8,   moq:4,   supplierName:'토핑솔루션',         supplierEmail:'liszzm@naver.com', leadDays:2 },
  { code:'ING010', name:'스위트콘',     spec:'3kg',   unit:'캔', currentStock:4,   safetyStock:5,   moq:6,   supplierName:'토핑솔루션',         supplierEmail:'liszzm@naver.com', leadDays:2 },
].map(calcItem);

const INITIAL_SUPPLIERS = [
  { name:'도미노푸드서플라이', manager:'박지훈', email:'liszzm@naver.com', leadDays:2, category:'도우/소스/치즈' },
  { name:'프레시미트코리아',   manager:'김현우', email:'liszzm@naver.com', leadDays:3, category:'페퍼로니/베이컨' },
  { name:'그린베지유통',       manager:'이수진', email:'liszzm@naver.com', leadDays:1, category:'양파/피망/버섯' },
  { name:'토핑솔루션',         manager:'정민아', email:'liszzm@naver.com', leadDays:2, category:'올리브/콘' },
];

// ── 스토리지 (Vercel KV 또는 메모리 fallback) ─────────────────────
// Upstash Redis 또는 메모리 fallback
let redisClient = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    redisClient = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (_) {}

const mem = {
  inventory: JSON.parse(JSON.stringify(INITIAL_INVENTORY)),
  suppliers: JSON.parse(JSON.stringify(INITIAL_SUPPLIERS)),
};

async function storageGet(key) {
  if (redisClient) {
    try { const val = await redisClient.get(key); return val ?? null; } catch (_) {}
  }
  return mem[key] ?? null;
}

async function storageSet(key, val) {
  if (redisClient) {
    try { await redisClient.set(key, val); } catch (_) {}
  }
  mem[key] = val;
}

async function loadInventory() {
  const data = await storageGet('inventory');
  if (!data) {
    await storageSet('inventory', INITIAL_INVENTORY);
    return JSON.parse(JSON.stringify(INITIAL_INVENTORY));
  }
  return data.map(calcItem);
}

async function saveInventory(data) {
  await storageSet('inventory', data);
}

// ── 미들웨어 ───────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ── 인증 ──────────────────────────────────────────────────────────
function makeToken(pw) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(pw).digest('hex');
}
function isAuth(req) {
  return req.cookies[COOKIE_NAME] === makeToken(TEAM_PASSWORD);
}
function authGuard(req, res, next) {
  const pub = ['/login', '/api/login'];
  if (pub.includes(req.path) || /\.(css|js|ico|png|woff2?)$/.test(req.path)) return next();
  if (!isAuth(req)) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: '로그인이 필요합니다.' });
    return res.redirect('/login');
  }
  next();
}
app.use(authGuard);

// ── 로그인 / 로그아웃 ─────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (isAuth(req)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  if (req.body.password === TEAM_PASSWORD) {
    res.cookie(COOKIE_NAME, makeToken(TEAM_PASSWORD), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   COOKIE_MAX_AGE,
    });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// ── 재고 API ──────────────────────────────────────────────────────
app.get('/api/inventory', async (_, res) => {
  res.json(await loadInventory());
});

app.post('/api/inventory', async (req, res) => {
  const items = await loadInventory();
  const body  = req.body;
  if (!body.name) return res.status(400).json({ error: '재료명은 필수입니다.' });
  const maxN = items.reduce((m, i) => Math.max(m, parseInt((i.code || '').replace(/\D/g,'')) || 0), 0);
  const item = calcItem({
    code:          `ING${String(maxN + 1).padStart(3, '0')}`,
    name:          body.name,
    spec:          body.spec          || '',
    unit:          body.unit          || '개',
    currentStock:  Number(body.currentStock)  || 0,
    safetyStock:   Number(body.safetyStock)   || 0,
    moq:           Number(body.moq)           || 0,
    supplierName:  body.supplierName  || '',
    supplierEmail: body.supplierEmail || '',
    leadDays:      Number(body.leadDays) || 0,
  });
  items.push(item);
  await saveInventory(items);
  res.status(201).json(item);
});

app.put('/api/inventory/:code', async (req, res) => {
  const items = await loadInventory();
  const idx   = items.findIndex(i => i.code === req.params.code);
  if (idx === -1) return res.status(404).json({ error: '품목 없음' });
  const fields = ['name','spec','unit','currentStock','safetyStock','moq','supplierName','supplierEmail','leadDays'];
  fields.forEach(k => { if (req.body[k] !== undefined) items[idx][k] = req.body[k]; });
  items[idx] = calcItem(items[idx]);
  await saveInventory(items);
  res.json(items[idx]);
});

app.delete('/api/inventory/:code', async (req, res) => {
  const items = await loadInventory();
  const next  = items.filter(i => i.code !== req.params.code);
  if (next.length === items.length) return res.status(404).json({ error: '품목 없음' });
  await saveInventory(next);
  res.json({ ok: true });
});

app.get('/api/suppliers', async (_, res) => {
  const data = await storageGet('suppliers');
  res.json(data || INITIAL_SUPPLIERS);
});

app.get('/api/summary', async (_, res) => {
  const items = await loadInventory();
  const low   = items.filter(i => i.status === '발주 필요');
  const bySupplier = {};
  low.forEach(it => {
    const k = it.supplierName || '미지정';
    if (!bySupplier[k]) bySupplier[k] = { count: 0, totalOrderQty: 0 };
    bySupplier[k].count++;
    bySupplier[k].totalOrderQty += it.orderQty;
  });
  res.json({
    totalItems:    items.length,
    lowCount:      low.length,
    normalCount:   items.length - low.length,
    totalOrderQty: low.reduce((s, i) => s + i.orderQty, 0),
    bySupplier,
  });
});

// ── 발주서 이메일 ─────────────────────────────────────────────────
app.post('/api/send-order', async (req, res) => {
  const { emailUser, emailPass, selectedCodes } = req.body;
  if (!emailUser || !emailPass) return res.status(400).json({ error: 'Gmail 계정과 앱 비밀번호를 입력해 주세요.' });

  const allItems = await loadInventory();
  const lowItems = selectedCodes?.length
    ? allItems.filter(i => selectedCodes.includes(i.code) && i.status === '발주 필요')
    : allItems.filter(i => i.status === '발주 필요');
  if (!lowItems.length) return res.status(400).json({ error: '발주할 품목이 없습니다.' });

  const bySupplier = {};
  lowItems.forEach(it => {
    const k = it.supplierName || '미지정';
    if (!bySupplier[k]) bySupplier[k] = [];
    bySupplier[k].push(it);
  });

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: emailUser, pass: emailPass } });
  const now     = new Date().toLocaleDateString('ko-KR');
  const results = [];

  for (const [supplierName, items] of Object.entries(bySupplier)) {
    const subject = `[발주요청] ${STORE_NAME} / ${supplierName} / ${now}`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:#0055A5;color:white;padding:20px 24px;">
    <h2 style="margin:0;font-size:18px;">📦 발주 요청서</h2>
    <p style="margin:4px 0 0;font-size:13px;opacity:.85;">${STORE_NAME} → ${supplierName} | ${now}</p>
  </div>
  <div style="padding:24px;">
    <p style="margin:0 0 16px;">안녕하세요 <strong>${supplierName}</strong> 담당자님,<br>
    아래 품목에 대해 발주 요청드립니다.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="background:#f5f5f5;">
        <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #0055A5;">재료명</th>
        <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #0055A5;">규격</th>
        <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #0055A5;">현재재고</th>
        <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #0055A5;">안전재고</th>
        <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #0055A5;color:#c0392b;">발주권장</th>
      </tr></thead>
      <tbody>
        ${items.map(it => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 12px;font-weight:600;">${it.name}</td>
          <td style="padding:10px 12px;text-align:center;color:#666;">${it.spec}</td>
          <td style="padding:10px 12px;text-align:center;color:#c0392b;font-weight:600;">${it.currentStock}${it.unit}</td>
          <td style="padding:10px 12px;text-align:center;">${it.safetyStock}${it.unit}</td>
          <td style="padding:10px 12px;text-align:center;color:#0055A5;font-weight:700;">${it.orderQty}${it.unit}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#555;">납품 일정 확인 후 회신 부탁드립니다. 감사합니다.</p>
    <p style="margin:8px 0 0;font-size:13px;color:#888;">점포 운영매니저 드림</p>
  </div>
</div>`;
    try {
      await transporter.sendMail({ from: emailUser, to: ORDER_TO_EMAIL, subject, html });
      results.push({ supplier: supplierName, itemCount: items.length, status: '발송 완료' });
    } catch (e) {
      results.push({ supplier: supplierName, itemCount: items.length, status: `실패: ${e.message}` });
    }
  }
  res.json({ ok: true, results, sentTo: ORDER_TO_EMAIL });
});

// ── 서버 시작 ─────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🍕 재고·발주 관리 시스템 → http://localhost:${PORT}`);
    console.log(`   기본 비밀번호: ${TEAM_PASSWORD}\n`);
  });
}

module.exports = app;
