import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = { type: Schema.Types.ObjectId, ref: 'User', index: true };

export const User = model('User', new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true, index: true },
  password: String,
  role: { type: String, enum: ['candidate', 'admin'], default: 'candidate' },
  active: { type: Boolean, default: true },
  premium: { type: Boolean, default: false },
}, { timestamps: true }));

export const Resume = model('Resume', new Schema({
  user: ref, filePath: String, extractedText: String, analysis: Schema.Types.Mixed,
}, { timestamps: true }));

export const Interview = model('Interview', new Schema({
  user: ref, domain: String,
  questions: [String], answers: [String],
  evaluations: [{ relevance: Number, accuracy: Number, clarity: Number, depth: Number, score: Number, comment: String, wordCount: Number, fillerCount: Number, technicalTerms: Number }],
  engine: String,
  overall: Number, strengths: [String], weaknesses: [String], suggestions: [String],
  status: { type: String, default: 'in_progress' },
}, { timestamps: true }));

export const Payment = model('Payment', new Schema({
  user: ref, orderId: String, paymentId: String, amount: Number,
  status: { type: String, default: 'created' },
}, { timestamps: true }));
