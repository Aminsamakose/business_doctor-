import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enterpriseName, overallBHS, dimensionScores, detectedPatterns } = body;

    if (!enterpriseName || !dimensionScores) {
      return NextResponse.json({ error: 'Missing diagnostic data' }, { status: 400 });
    }

    const systemPrompt = `You are the Lead Medical-Business Consultant for Business Doctor™.
Your role is to analyze the Business Health Score (BHS) and diagnostic patterns of an enterprise and prescribe a precise, evidence-based "Business Prescription™".

A Business Prescription must follow this exact 8-component structure:
1. EXECUTIVE SUMMARY: A high-level diagnosis of the enterprise's current state.
2. CRITICAL RISK MITIGATION: Immediate actions to stop "bleeding" (addressing the most severe Detected Patterns).
3. DIMENSIONAL IMPROVEMENT PLAN: Specific steps to raise scores in the lowest performing dimensions.
4. RESOURCE ALLOCATION STRATEGY: How to shift capital, time, and people to the highest-impact areas.
5. INNOVATION & AI ROADMAP: A plan to increase Adaptive Capacity and AI Readiness.
6. GOVERNANCE & STRUCTURE ADJUSTMENT: Changes needed in leadership, oversight, or operating models.
7. RECOVERY KPIs: 3-5 measurable indicators that will prove the treatment is working.
8. 90-DAY IMPLEMENTATION TIMELINE: A phased approach (Days 1-30, 31-60, 61-90).

Tone: Clinical, authoritative, objective, and high-stakes. Avoid generic consulting jargon. Be specific.`;

    const userPrompt = `Prescribe treatment for: ${enterpriseName}
Overall BHS: ${overallBHS}%
Dimensional Scores: ${JSON.stringify(dimensionScores)}
Detected Patterns: ${JSON.stringify(detectedPatterns)}

Generate the full 8-component Business Prescription™ now.`;

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const prescriptionText = response.content[0].type === 'text'
      ? (response.content[0] as any).text
      : 'Error generating prescription text';

    return NextResponse.json({
      success: true,
      prescription: prescriptionText,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Prescription Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
