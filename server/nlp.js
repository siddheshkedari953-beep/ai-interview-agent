// Built-in NLP engine (no external AI): tokenizer, TF-IDF cosine similarity,
// skill extraction, ATS scoring, job-description matching, and answer scoring.
const STOP = new Set(('a an the and or but if of to in on at by for with from as is are was were be been being this that these those it its i you he she we they my your our their me us them do does did have has had not no can could should would will may might about into over under than then so such very also just more most some any all each other which who whom what when where why how there here').split(' '));
const clamp = (v, lo = 0, hi = 10) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => +v.toFixed(1);

export const tokenize = (t = '') => t.toLowerCase().match(/[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]/g) || [];
export const terms = (t) => tokenize(t).filter((w) => w.length > 1 && !STOP.has(w));

// ---------- TF-IDF cosine similarity (IDF computed over the two documents) ----------
export function similarity(a, b) {
  const A = terms(a), B = terms(b);
  const sa = new Set(A), sb = new Set(B);
  const idf = (w) => Math.log(3 / ((sa.has(w) ? 1 : 0) + (sb.has(w) ? 1 : 0) + 1)) + 1;
  const vec = (T) => { const m = {}; T.forEach((w) => (m[w] = (m[w] || 0) + 1)); for (const w in m) m[w] *= idf(w); return m; };
  const va = vec(A), vb = vec(B);
  let dot = 0, na = 0, nb = 0;
  for (const w in va) { na += va[w] ** 2; if (vb[w]) dot += va[w] * vb[w]; }
  for (const w in vb) nb += vb[w] ** 2;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---------- Skill extraction ----------
export const SKILLS = {
  Languages: ['javascript', 'typescript', 'java', 'python', 'c++', 'c#', 'golang', 'rust', 'php', 'kotlin', 'swift', 'sql', 'html', 'css', 'bash'],
  Frontend: ['react', 'redux', 'angular', 'vue', 'next.js', 'tailwind', 'bootstrap', 'jquery', 'vite', 'webpack'],
  Backend: ['node.js', 'nodejs', 'express', 'express.js', 'django', 'flask', 'spring', 'spring boot', 'fastapi', 'restful', 'rest api', 'graphql', 'jwt', 'microservices'],
  Database: ['mongodb', 'mongoose', 'mysql', 'postgresql', 'redis', 'sqlite', 'firebase', 'oracle'],
  'Cloud & DevOps': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'linux', 'git', 'github', 'nginx'],
  'Data & AI': ['machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'nlp', 'opencv', 'data analysis'],
  Concepts: ['oop', 'data structures', 'algorithms', 'agile', 'scrum', 'unit testing', 'postman', 'api', 'multithreading'],
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
const has = (text, s) => new RegExp('(^|[^a-z0-9+#])' + esc(s) + '($|[^a-z0-9+#])').test(text);
export function extractSkills(text = '') {
  const low = text.toLowerCase(), out = {};
  for (const [cat, list] of Object.entries(SKILLS)) {
    const found = list.filter((s) => has(low, s));
    if (found.length) out[cat] = found;
  }
  return out;
}
const flat = (text) => Object.values(extractSkills(text)).flat();

// ---------- Resume analysis + ATS score ----------
const SECTIONS = {
  education: /\beducation\b|\bb\.?tech\b|\bbsc\b|\bdegree\b|\buniversity\b/,
  experience: /\bexperience\b|\binternship\b|\bintern\b|\bemployment\b/,
  projects: /\bprojects?\b/,
  skills: /\bskills?\b|\btechnologies\b/,
  summary: /\bsummary\b|\bobjective\b|\bprofile\b/,
  certifications: /\bcertifications?\b|\bcertified\b/,
  achievements: /\bachievements?\b|\bawards?\b/,
};
const VERBS = ['developed', 'built', 'designed', 'implemented', 'created', 'led', 'managed', 'optimized', 'deployed', 'integrated', 'improved', 'automated', 'analyzed', 'engineered'];

export function analyzeResume(text = '') {
  const low = text.toLowerCase();
  const skills = extractSkills(text);
  const nSkills = Object.values(skills).flat().length;
  const sections = Object.fromEntries(Object.entries(SECTIONS).map(([k, re]) => [k, re.test(low)]));
  const contact = { email: /[\w.+-]+@[\w-]+\.[\w.]+/.test(text), phone: /\+?\d[\d\s-]{8,}\d/.test(text), links: /linkedin\.com|github\.com/.test(low) };
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const metrics = (text.match(/\d+\s?%|\b\d+\s?(users|ms|x|k|\+)/gi) || []).length;
  const verbs = VERBS.filter((v) => low.includes(v)).length;
  const core = ['education', 'experience', 'projects', 'skills'].filter((k) => sections[k]).length;
  const lenPts = wordCount >= 250 && wordCount <= 900 ? 10 : (wordCount >= 120 && wordCount < 250) || (wordCount > 900 && wordCount <= 1300) ? 6 : 2;
  const breakdown = {
    'Sections': [core * 10, 40],
    'Contact info': [Object.values(contact).filter(Boolean).length * 5, 15],
    'Skills': [Math.min(20, nSkills * 2), 20],
    'Length': [lenPts, 10],
    'Impact metrics': [Math.min(10, metrics * 3), 10],
    'Action verbs': [Math.min(5, verbs), 5],
  };
  const score = Object.values(breakdown).reduce((s, [g]) => s + g, 0);
  const tips = [];
  ['education', 'experience', 'projects', 'skills'].forEach((k) => !sections[k] && tips.push(`Add a clear "${k}" section.`));
  if (!contact.email) tips.push('Add a professional email address.');
  if (!contact.phone) tips.push('Add a phone number.');
  if (!contact.links) tips.push('Add your GitHub or LinkedIn link.');
  if (nSkills < 6) tips.push('List more technical skills (languages, frameworks, tools).');
  if (metrics < 2) tips.push('Quantify your impact (e.g. "reduced load time by 30%").');
  if (verbs < 3) tips.push('Start bullet points with action verbs (built, deployed, optimized).');
  if (wordCount < 250) tips.push('Resume looks short; describe your projects in more detail.');
  if (wordCount > 900) tips.push('Resume is long; keep it to 1-2 pages.');
  return { skills, sections, contact, wordCount, ats: { score, breakdown }, tips };
}

// ---------- Resume vs Job Description ----------
export function matchJD(resume, jd) {
  const jdSkills = [...new Set(flat(jd))], rs = new Set(flat(resume));
  const missingSkills = jdSkills.filter((s) => !rs.has(s));
  const freq = {};
  terms(jd).forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  const rset = new Set(terms(resume));
  const missingKeywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 25).map((x) => x[0]).filter((w) => !rset.has(w)).slice(0, 10);
  const sim = similarity(resume, jd);
  const cov = jdSkills.length ? (jdSkills.length - missingSkills.length) / jdSkills.length : sim;
  return { match: Math.round(100 * (0.6 * cov + 0.4 * Math.min(1, sim * 2))), similarity: r1(sim * 100), matchedSkills: jdSkills.filter((s) => rs.has(s)), missingSkills, missingKeywords };
}

// ---------- Local answer scoring ----------
const FILLERS = /\b(um+|uh+|like|basically|actually|you know|kind of|sort of|i guess|maybe|stuff|things)\b/g;
const EXAMPLES = /\b(for example|for instance|e\.g\.|such as|because|therefore|however|in my project|i used|i built)\b/g;

export function scoreAnswer(question, answer = '') {
  const text = String(answer).trim();
  const wordCount = tokenize(text).length;
  const fillerCount = (text.toLowerCase().match(FILLERS) || []).length;
  const technicalTerms = flat(text).length;
  if (wordCount < 3) return { relevance: 0, accuracy: 0, clarity: 0, depth: 0, score: 0, wordCount, fillerCount, technicalTerms };
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length || 1;
  const avgLen = wordCount / sentences;
  const examples = (text.toLowerCase().match(EXAMPLES) || []).length;
  const relevance = clamp(2 + similarity(question, text) * 30 + Math.min(wordCount, 40) / 10);
  const accuracy = clamp(2 + technicalTerms * 1.5 + Math.min(wordCount, 60) / 20);
  const clarity = clamp(8 - fillerCount * 0.8 - (avgLen > 35 ? 2 : 0) - (avgLen < 5 ? 2 : 0) - (wordCount < 15 ? 2 : 0));
  const depth = clamp((wordCount < 15 ? 2 : wordCount < 40 ? 4 : wordCount < 80 ? 6 : wordCount < 150 ? 7.5 : 8.5) + Math.min(examples, 2) * 0.75);
  const d = { relevance: r1(relevance), accuracy: r1(accuracy), clarity: r1(clarity), depth: r1(depth) };
  return { ...d, score: r1((d.relevance + d.accuracy + d.clarity + d.depth) / 4), wordCount, fillerCount, technicalTerms };
}

// ---------- Hybrid blend: 70% LLM + 30% local NLP (local only if the LLM is unavailable) ----------
const DIMS = ['relevance', 'accuracy', 'clarity', 'depth'];
export function blend(local, ai) {
  const evaluations = local.map((l, i) => {
    const a = ai?.evaluations?.[i];
    const e = {};
    DIMS.forEach((d) => (e[d] = r1(a ? 0.7 * a[d] + 0.3 * l[d] : l[d])));
    e.score = r1(DIMS.reduce((s, d) => s + e[d], 0) / 4);
    e.comment = a?.comment || (l.wordCount < 3 ? 'No answer given.' : `Local analysis: ${l.wordCount} words, ${l.technicalTerms} technical terms, ${l.fillerCount} filler words.`);
    Object.assign(e, { wordCount: l.wordCount, fillerCount: l.fillerCount, technicalTerms: l.technicalTerms });
    return e;
  });
  const overall = r1(evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length);
  const avg = (d) => evaluations.reduce((s, e) => s + e[d], 0) / evaluations.length;
  const fb = { strengths: [], weaknesses: [], suggestions: [] };
  const TIPS = { relevance: 'Answer the question directly in the first sentence.', accuracy: 'Use precise technical terms and name the concepts involved.', clarity: 'Use shorter sentences and avoid filler words.', depth: 'Explain the "why" and add a concrete example from your projects.' };
  DIMS.forEach((d) => { if (avg(d) >= 7) fb.strengths.push(`Good ${d} across answers.`); if (avg(d) < 5) { fb.weaknesses.push(`Low ${d} score.`); fb.suggestions.push(TIPS[d]); } });
  return {
    evaluations, overall,
    strengths: ai?.strengths?.length ? ai.strengths : fb.strengths,
    weaknesses: ai?.weaknesses?.length ? ai.weaknesses : fb.weaknesses,
    suggestions: ai?.suggestions?.length ? ai.suggestions : fb.suggestions,
    engine: ai ? 'Hybrid (LLM 70% + built-in NLP 30%)' : 'Built-in NLP engine only (AI unavailable)',
  };
}
