import { NextResponse } from 'next/server';

// Sample Question Bank for the Free Check (Simplified from the doc)
const FREE_CHECK_QUESTIONS = [
  { id: 'q1', dimension: 'D1', text: 'Does your enterprise have a documented strategy for absorbing financial shocks?', max: 10 },
  { id: 'q2', dimension: 'D6', text: 'Is your business operation dependent on a single founder for all key decisions?', max: 10, inverted: true },
  { id: 'q3', dimension: 'D12', text: 'How quickly can your enterprise adopt a new technology to solve a market shift?', max: 10 },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enterpriseName, responses } = body;

    if (!enterpriseName || !responses) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let totalScore = 0;
    let maxPossible = 0;

    // Calculate BHS
    FREE_CHECK_QUESTIONS.forEach(q => {
      const answer = responses[q.id] || 0;
      totalScore += answer;
      maxPossible += q.max;
    });

    const bhs = Math.round((totalScore / maxPossible) * 100);

    // In a real app, we would save this to PostgreSQL here
    // await db.assessment_sessions.create(...)

    return NextResponse.json({
      success: true,
      bhs,
      message: bhs > 70 ? 'Strong Vitality' : bhs > 40 ? 'Stable but Fragile' : 'Critical Risk',
      enterprise: enterpriseName
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
