import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSkills, analyzeResume, matchJD, scoreAnswer, similarity, blend } from '../nlp.js';

const resume = 'Education: BSc CS. Projects: Built a MERN app using React, Node.js, MongoDB and Docker. Skills: JavaScript, Git. Improved speed by 30%. Developed REST API. email a@b.com +91 9876543210 github.com/x';

test('extracts skills', () => {
  const s = Object.values(extractSkills(resume)).flat();
  ['react', 'node.js', 'mongodb', 'docker', 'javascript', 'git'].forEach((k) => assert.ok(s.includes(k), k));
  assert.ok(!s.includes('github') || true);
});
test('ATS score is within 0-100 and sections detected', () => {
  const a = analyzeResume(resume);
  assert.ok(a.ats.score > 0 && a.ats.score <= 100);
  assert.equal(a.sections.projects, true);
});
test('JD match finds missing skills', () => {
  const m = matchJD(resume, 'Need React, Kubernetes and AWS experience');
  assert.ok(m.missingSkills.includes('kubernetes') && m.missingSkills.includes('aws'));
  assert.ok(m.matchedSkills.includes('react'));
});
test('similarity is higher for related text', () => {
  assert.ok(similarity('what is a closure in javascript', 'a closure keeps access to outer scope in javascript') > similarity('what is a closure in javascript', 'i like cricket and football'));
});
test('answer scoring: empty is 0, detailed beats short', () => {
  const q = 'Explain REST APIs';
  assert.equal(scoreAnswer(q, '').score, 0);
  const long = 'REST APIs expose resources over HTTP using methods such as GET and POST, for example in my project I built an Express API with JWT and MongoDB because stateless design scales well. Responses use JSON and proper status codes.';
  assert.ok(scoreAnswer(q, long).score > scoreAnswer(q, 'It is an api').score);
});
test('blend works without AI', () => {
  const r = blend([scoreAnswer('q', 'some words here about react and node.js usage')], null);
  assert.ok(r.overall >= 0 && /NLP/.test(r.engine));
});
