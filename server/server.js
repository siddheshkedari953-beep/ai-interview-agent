import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { auth } from './auth.js';
import api from './routes.js';
import { User } from './models.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
fs.mkdirSync('uploads', { recursive: true });
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), auth);
app.use('/api', api);
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_interview');
console.log('MongoDB connected');

const email = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
if (!(await User.findOne({ role: 'admin' }))) {
  await User.create({ name: 'Admin', email, role: 'admin', password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10) });
  console.log('Admin created:', email);
}
const port = process.env.PORT || 5000;
app.listen(port, () => console.log('API running on http://localhost:' + port));
