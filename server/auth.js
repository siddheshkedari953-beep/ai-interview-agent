import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const sign = (u) => jwt.sign({ id: u._id, role: u.role }, SECRET, { expiresIn: '1d' });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, premium: u.premium });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export async function protect(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const p = jwt.verify(token, SECRET);
    const u = await User.findById(p.id);
    if (!u || !u.active) throw new Error('bad user');
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
export const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });

export const auth = Router();

auth.post('/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Valid name and email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered' });
  const u = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  res.json({ token: sign(u), user: pub(u) });
}));

auth.post('/login', wrap(async (req, res) => {
  const u = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password))) return res.status(401).json({ error: 'Invalid credentials' });
  if (!u.active) return res.status(403).json({ error: 'Account disabled' });
  res.json({ token: sign(u), user: pub(u) });
}));

auth.get('/me', protect, (req, res) => res.json({ user: pub(req.user) }));
