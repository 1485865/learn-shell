import { knownTypes } from './validate-pack.mjs';
export function createSession(day) {
  return { date: day.date, items: day.items, questions: day.questions.filter(q => knownTypes.includes(q.type)),
    skipped: day.questions.some(q => !knownTypes.includes(q.type)), card: 0, question: 0, answered: false,
    phase: day.items.length ? 'cards' : day.questions.some(q => knownTypes.includes(q.type)) ? 'questions' : 'complete' };
}
export function nextCard(session) {
  if (session.phase !== 'cards') return session;
  const card = session.card + 1;
  return { ...session, card, phase: card < session.items.length ? 'cards' : session.questions.length ? 'questions' : 'complete' };
}
export function answerQuestion(session, value) {
  if (session.phase !== 'questions' || session.answered) return session;
  const q = session.questions[session.question];
  const normalize = x => x.trim().toLowerCase();
  const correct = q.type === 'input' ? normalize(value) === normalize(q.answer) : value === q.answer;
  return { ...session, answered: true, correct };
}
export function nextQuestion(session) {
  if (!session.answered) return session;
  const question = session.question + 1;
  return { ...session, question, answered: false, phase: question < session.questions.length ? 'questions' : 'complete' };
}
