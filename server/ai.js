// Works with ANY OpenAI-compatible endpoint: Groq (free tier) or Ollama (local, free).
const BASE = () => process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1';

async function chat(system, user) {
  const key = process.env.AI_API_KEY;
  const r = await fetch(BASE() + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key && { Authorization: 'Bearer ' + key }) },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.4,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw Object.assign(new Error(`AI service error ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
  return (await r.json()).choices[0].message.content;
}

function parseJSON(text) {
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  if (!m) throw Object.assign(new Error('AI returned invalid format, try again'), { status: 502 });
  return JSON.parse(m[0]);
}

const FALLBACK = [
  'Tell me about yourself and the project you are most proud of.',
  'Explain a technical challenge you faced and how you solved it.',
  'How do you debug a problem in production?',
  'What is the difference between SQL and NoSQL databases?',
  'How do you make sure your code is maintainable?',
  'Describe how REST APIs work.',
  'How do you handle disagreements in a team?',
  'Where do you want to be in three years?',
];

export async function generateQuestions(domain, resumeText, n) {
  try {
    const out = parseJSON(await chat(
      'You are an expert technical interviewer. Reply with a JSON array of strings only.',
      `Create ${n} interview questions for the domain "${domain}". Mix: about half domain fundamentals, ` +
      `half personalised to the candidate's resume (projects, skills, experience). Questions must be answerable in text, ` +
      `ordered easy to hard.\n\nRESUME:\n${resumeText.slice(0, 4000)}`));
    const qs = out.map(String).filter(Boolean).slice(0, n);
    if (qs.length) return qs;
  } catch (e) {
    console.error('Question generation failed, using fallback:', e.message);
  }
  return FALLBACK.slice(0, n);
}

export async function evaluateAnswers(domain, questions, answers) {
  const qa = questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]?.trim() || '(no answer)'}`).join('\n\n');
  const out = parseJSON(await chat(
    'You are a strict but fair technical interviewer. Reply with a JSON object only.',
    `Domain: ${domain}\nScore each answer 0-10 for relevance, accuracy, clarity and depth. Unanswered = 0.\n\n${qa}\n\n` +
    `Return: {"evaluations":[{"relevance":0,"accuracy":0,"clarity":0,"depth":0,"comment":"one sentence"}] (exactly ${questions.length} items),` +
    `"strengths":["..."],"weaknesses":["..."],"suggestions":["actionable tips"]}`));
  const clamp = (v) => Math.min(10, Math.max(0, Number(v) || 0));
  const evaluations = questions.map((_, i) => {
    const e = out.evaluations?.[i] || {};
    const [relevance, accuracy, clarity, depth] = ['relevance', 'accuracy', 'clarity', 'depth'].map((k) => clamp(e[k]));
    return { relevance, accuracy, clarity, depth, score: +((relevance + accuracy + clarity + depth) / 4).toFixed(1), comment: e.comment || '' };
  });
  const overall = +(evaluations.reduce((s, e) => s + e.score, 0) / evaluations.length).toFixed(1);
  return { evaluations, overall, strengths: out.strengths || [], weaknesses: out.weaknesses || [], suggestions: out.suggestions || [] };
}
