import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import Razorpay from 'razorpay';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { User, Resume, Interview, Payment } from './models.js';
import { protect, adminOnly } from './auth.js';
import { generateQuestions, evaluateAnswers } from './ai.js';
import { analyzeResume, matchJD, scoreAnswer, blend } from './nlp.js';

const r = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const bad = (status, message) => Object.assign(new Error(message), { status });
const FREE_LIMIT = 3, PRICE_PAISE = 9900;
const rzp = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(bad(400, 'Only PDF files allowed')),
});

// ---------- Resume ----------
r.post('/resume', protect, (req, res, next) => upload.single('resume')(req, res, (e) => e ? next(bad(400, e.message)) : next()),
  wrap(async (req, res) => {
    if (!req.file) throw bad(400, 'Please choose a PDF file');
    let text = '';
    try { text = (await pdf(req.file.buffer)).text.replace(/\s+/g, ' ').trim(); }
    catch { throw bad(400, 'Could not read this PDF (corrupted or password-protected)'); }
    if (text.length < 30) throw bad(400, 'No readable text found (scanned PDF?). Upload a text-based PDF.');
    const filePath = `uploads/${req.user._id}-${Date.now()}.pdf`;
    fs.writeFileSync(filePath, req.file.buffer);
    const analysis = analyzeResume(text);
    const doc = await Resume.create({ user: req.user._id, filePath, extractedText: text, analysis });
    res.json({ id: doc._id, chars: text.length, preview: text.slice(0, 300), createdAt: doc.createdAt, analysis });
  }));

r.get('/resume/latest', protect, wrap(async (req, res) => {
  const d = await Resume.findOne({ user: req.user._id }).sort('-createdAt');
  res.json(d ? { id: d._id, chars: d.extractedText.length, preview: d.extractedText.slice(0, 300), createdAt: d.createdAt, analysis: d.analysis || analyzeResume(d.extractedText) } : null);
}));

r.post('/resume/match', protect, wrap(async (req, res) => {
  const jd = String(req.body.jobDescription || '').slice(0, 8000);
  if (jd.trim().length < 20) throw bad(400, 'Paste a longer job description');
  const d = await Resume.findOne({ user: req.user._id }).sort('-createdAt');
  if (!d) throw bad(400, 'Upload your resume first');
  res.json(matchJD(d.extractedText, jd));
}));

// ---------- Interviews ----------
r.post('/interviews/start', protect, wrap(async (req, res) => {
  const domain = String(req.body.domain || '').slice(0, 50);
  if (!domain) throw bad(400, 'Select a domain');
  const resume = await Resume.findOne({ user: req.user._id }).sort('-createdAt');
  if (!resume) throw bad(400, 'Upload your resume first');
  if (!req.user.premium && (await Interview.countDocuments({ user: req.user._id })) >= FREE_LIMIT)
    throw bad(402, `Free limit of ${FREE_LIMIT} interviews reached. Upgrade to premium for unlimited interviews.`);
  const questions = await generateQuestions(domain, resume.extractedText, req.user.premium ? 8 : 5);
  const iv = await Interview.create({ user: req.user._id, domain, questions, answers: questions.map(() => '') });
  res.json({ id: iv._id });
}));

r.get('/interviews', protect, wrap(async (req, res) => {
  res.json(await Interview.find({ user: req.user._id }).sort('-createdAt').select('domain overall status createdAt'));
}));

r.get('/interviews/:id', protect, wrap(async (req, res) => {
  const iv = await Interview.findById(req.params.id);
  if (!iv || (String(iv.user) !== String(req.user._id) && req.user.role !== 'admin')) throw bad(404, 'Interview not found');
  res.json(iv);
}));

r.post('/interviews/:id/submit', protect, wrap(async (req, res) => {
  const iv = await Interview.findById(req.params.id);
  if (!iv || String(iv.user) !== String(req.user._id)) throw bad(404, 'Interview not found');
  if (iv.status === 'completed') throw bad(400, 'Already submitted');
  const answers = (req.body.answers || []).map((a) => String(a || '').slice(0, 3000));
  const local = iv.questions.map((q, i) => scoreAnswer(q, answers[i]));
  let ai = null;
  try { ai = await evaluateAnswers(iv.domain, iv.questions, answers); }
  catch (e) { console.error('AI evaluation failed, using built-in NLP only:', e.message); }
  Object.assign(iv, blend(local, ai), { answers, status: 'completed' });
  await iv.save();
  res.json({ id: iv._id });
}));

r.get('/stats/me', protect, wrap(async (req, res) => {
  const list = await Interview.find({ user: req.user._id, status: 'completed' }).sort('createdAt');
  const avg = (a) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : 0);
  const all = list.flatMap((i) => i.evaluations);
  res.json({
    total: list.length, avg: avg(list.map((i) => i.overall)), best: Math.max(0, ...list.map((i) => i.overall)),
    series: list.map((i) => ({ date: i.createdAt, domain: i.domain, score: i.overall })),
    dims: Object.fromEntries(['relevance', 'accuracy', 'clarity', 'depth'].map((d) => [d, avg(all.map((e) => e[d]))])),
  });
}));

// ---------- Payments (Razorpay test mode, or mock if no keys) ----------
r.post('/payment/order', protect, wrap(async (req, res) => {
  let orderId, mock = !rzp;
  if (rzp) orderId = (await rzp.orders.create({ amount: PRICE_PAISE, currency: 'INR', receipt: 'rcpt_' + Date.now() })).id;
  else orderId = 'mock_' + crypto.randomBytes(6).toString('hex');
  await Payment.create({ user: req.user._id, orderId, amount: PRICE_PAISE / 100 });
  res.json({ orderId, amount: PRICE_PAISE, keyId: process.env.RAZORPAY_KEY_ID, mock });
}));

r.post('/payment/verify', protect, wrap(async (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  const p = await Payment.findOne({ orderId, user: req.user._id });
  if (!p) throw bad(404, 'Order not found');
  if (rzp) {
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(orderId + '|' + paymentId).digest('hex');
    const ok = signature && expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!ok) { p.status = 'failed'; await p.save(); throw bad(400, 'Payment verification failed'); }
  }
  p.status = 'success'; p.paymentId = paymentId || 'mock_payment'; await p.save();
  await User.findByIdAndUpdate(req.user._id, { premium: true });
  res.json({ ok: true });
}));

// ---------- Admin ----------
r.use('/admin', protect, adminOnly);
r.get('/admin/stats', wrap(async (req, res) => {
  const [users, interviews, revenue, byDomain] = await Promise.all([
    User.countDocuments({ role: 'candidate' }),
    Interview.countDocuments(),
    Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Interview.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: '$domain', avg: { $avg: '$overall' }, count: { $sum: 1 } } }]),
  ]);
  res.json({ users, interviews, revenue: revenue[0]?.total || 0, byDomain });
}));
r.get('/admin/users', wrap(async (req, res) => res.json(await User.find().sort('-createdAt').select('-password'))));
r.patch('/admin/users/:id/toggle', wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u || u.role === 'admin') throw bad(400, 'Cannot modify this user');
  u.active = !u.active; await u.save(); res.json({ active: u.active });
}));
r.get('/admin/payments', wrap(async (req, res) => res.json(await Payment.find().sort('-createdAt').populate('user', 'name email'))));
r.get('/admin/interviews', wrap(async (req, res) => res.json(await Interview.find().sort('-createdAt').limit(100).populate('user', 'name email').select('domain overall status createdAt user'))));

export default r;
