import { NextResponse } from 'next/server';
import questionsData from '@/data/questions.json';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { enterpriseName, responses } = body;

    if (!enterpriseName || !responses) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const dimensionScores: Record<string, { score: number, max: number }> = {};
    const totalWeightedScore = 0;
    let overallMax = 0;

    // 1. Calculate Dimensional Scores
    questionsData.questions.forEach(q => {
      const val = responses[q.id] || 0;
      if (!dimensionScores[q.dim]) {
        dimensionScores[q.dim] = { score: 0, max: 0 };
      }
      dimensionScores[q.dim].score += val;
      dimensionScores[q.dim].max += q.weight;
    });

    const dimensionPercentages: Record<string, number> = {};
    Object.entries(dimensionScores).forEach(([dim, data]) => {
      dimensionPercentages[dim] = Math.round((data.score / data.max) * 100);
    });

    // 2. Evaluate Diagnostic Patterns (D01-D10)
    // We implement a simplified version of the pattern logic based on the BH-OS methodology
    const patterns = [];
    const p = dimensionPercentages;

    // Pattern D01: Founder Dependency (High Vitality, Low Governance/People)
    if (p['D2'] > 70 && p['D7'] < 40) {
      patterns.push({
        code: 'D01',
        name: 'Founder Dependency',
        risk: 'High',
        description: 'Enterprise generates high value but relies entirely on the founder for decision-making and governance.'
      });
    }

    // Pattern D02: Operational Fragility (High Market, Low Operational)
    if (p['D4'] > 70 && p['D3'] < 40) {
      patterns.push({
        code: 'D02',
        name: 'Operational Fragility',
        risk: 'Medium',
        description: 'Strong market demand is masking a lack of scalable operational processes.'
      });
    }

    // Pattern D03: Stagnant Innovation (High Financial, Low Innovation/AI)
    if (p['D2'] > 70 && p['D8'] < 40) {
      patterns.push({
        code: 'D03',
        name: 'Stagnant Innovation',
        risk: 'Medium',
        description: 'Current profitability is high, but lack of innovation puts long-term viability at risk.'
      });
    }

    // Pattern D04: Attrition Risk (High Operational, Low People/Leadership)
    if (p['D3'] > 70 && p['D6'] < 40) {
      patterns.push({
        code: 'D04',
        name: 'Attrition Risk',
        risk: 'High',
        description: 'Strong processes are in place, but employee engagement and leadership are failing.'
      });
    }

    // Pattern D05: Market Blindness (High Operational, Low Market/Customer)
    if (p['D3'] > 70 && p['D4'] < 40) {
      patterns.push({
        code: 'D05',
        name: 'Market Blindness',
        risk: 'Medium',
        description: 'Enterprise is efficient at producing a product that the market may no longer want.'
      });
    }

    // Pattern D06: Governance Vacuum (High Growth, Low Governance/Risk)
    if (p['D2'] > 70 && p['D7'] < 30) {
      patterns.push({
        code: 'D06',
        name: 'Governance Vacuum',
        risk: 'High',
        description: 'Rapid financial growth has outpaced the creation of necessary controls and oversight.'
      });
    }

    // Pattern D07: Technical Debt Trap (High Market, Low Technology)
    if (p['D4'] > 70 && p['D9'] < 40) {
      patterns.push({
        code: 'D07',
        name: 'Technical Debt Trap',
        risk: 'Medium',
        description: 'Market success is being maintained on obsolete technology, creating a failure point.'
      });
    }

    // Pattern D08: Sustainability Gap (High Vitality, Low Sustainability)
    if (p['D2'] > 70 && p['D11'] < 40) {
      patterns.push({
        code: 'D08',
        name: 'Sustainability Gap',
        risk: 'Low',
        description: 'Profitable in the short term, but lacks the systemic sustainability for long-term survival.'
      });
    }

    // Pattern D09: AI Laggard (High Operational, Low AI Readiness)
    if (p['D3'] > 70 && p['D12'] < 30) {
      patterns.push({
        code: 'D09',
        name: 'AI Laggard',
        risk: 'Medium',
        description: 'Strong operational base is at risk of disruption by AI-native competitors.'
      });
    }

    // Pattern D10: Systemic Fragility (Low across all Resilience dimensions)
    if (p['D1'] < 40 && p['D6'] < 40 && p['D7'] < 40 && p['D10'] < 40) {
      patterns.push({
        code: 'D10',
        name: 'Systemic Fragility',
        risk: 'Critical',
        description: 'Enterprise lacks basic resilience across leadership, people, governance, and risk management.'
      });
    }

    const overallBHS = Math.round(Object.values(dimensionPercentages).reduce((a, b) => a + b, 0) / 12);

    return NextResponse.json({
      success: true,
      enterprise: enterpriseName,
      overallBHS,
      dimensionScores: dimensionPercentages,
      detectedPatterns: patterns,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Diagnosis Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
