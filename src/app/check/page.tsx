'use client';

import React, { useState } from 'react';
import { store } from '@/lib/store';

const QUESTIONS = [
  { id: 'q1', text: 'Does your enterprise have a documented strategy for absorbing financial shocks?', options: [{ text: 'Yes, fully documented', val: 10 }, { text: 'Partially', val: 5 }, { text: 'No', val: 0 }] },
  { id: 'q2', text: 'Is your business operation dependent on a single founder for all key decisions?', options: [{ text: 'No, distributed model', val: 10 }, { text: 'To some extent', val: 5 }, { text: 'Yes, completely', val: 0 }] },
  { id: 'q3', text: 'How quickly can your enterprise adopt a new technology to solve a market shift?', options: [{ text: 'Within weeks', val: 10 }, { text: 'A few months', val: 5 }, { text: 'Slowly/Disruptive', val: 0 }] },
];

export default function HealthCheckPage() {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState({});
  const [enterprise, setEnterprise] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnswer = (qId, val) => {
    setResponses(prev => ({ ...prev, [qId]: val }));
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      submitAssessment();
    }
  };

  const submitAssessment = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enterpriseName: enterprise || 'Unnamed Enterprise', responses }),
      });
      const data = await res.json();
      setResult(data);

      // Persistence: save as a preliminary diagnosis
      store.saveDiagnosis({
        enterprise: data.enterprise,
        overallBHS: data.bhs,
        dimensionScores: { 'General': data.bhs }, // Simplified for free check
        detectedPatterns: []
      });
    } catch (e) {
      alert('Error submitting assessment');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border-2 border-blue-800 p-8 shadow-2xl text-center">
          <span className="text-xs font-mono uppercase text-slate-500 tracking-widest">Preliminary BHS Score</span>
          <div className="text-7xl font-bold text-blue-800 my-6 font-mono">{result.bhs}%</div>
          <p className="text-xl font-medium text-slate-700 mb-8">{result.message}</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => window.location.href = '/diagnose'} className="btn-clinical btn-primary w-full">Go to Full Diagnosis →</button>
            <button onClick={() => window.location.reload()} className="btn-clinical btn-secondary w-full">Restart Check</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full clinical-card p-12">
        {step === 0 && (
          <div className="text-center">
            <h1 className="text-3xl font-serif font-bold text-blue-900 mb-4">Business Health Check</h1>
            <p className="text-slate-600 mb la-8">Enter your enterprise name to begin the diagnostic process.</p>
            <input
              type="text"
              placeholder="Enterprise Name"
              className="clinical-input mb-6 text-lg"
              value={enterprise}
              onChange={(e) => setEnterprise(e.target.value)}
            />
            <button
              disabled={!enterprise}
              onClick={() => setStep(1)}
              className="btn-clinical btn-primary w-full text-lg"
            >
              Start Assessment
            </button>
          </div>
        )}

        {step > 0 && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <span className="text-xs font-mono text-slate-400 uppercase">Question {step} of {QUESTIONS.length}</span>
              <div className="h-1 w-32 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-800 transition-all" style={{ width: `${(step / QUESTIONS.length) * 100}%` }}></div>
              </div>
            </div>
            <h2 className="text-2xl font-medium text-slate-800 mb-8">{QUESTIONS[step-1].text}</h2>
            <div className="grid gap-4">
              {QUESTIONS[step-1].options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAnswer(QUESTIONS[step-1].id, opt.val)}
                  className="w-full p-4 text-left border border-slate-200 rounded hover:border-blue-500 hover:bg-blue-50 transition"
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-800 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="font-mono text-sm text-slate-500 uppercase">Calculating BHS...</p>
          </div>
        )}
      </div>
    </div>
  );
}
