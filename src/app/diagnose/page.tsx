'use client';

import React, { useState, useEffect } from 'react';
import { store } from '@/lib/store';
import questionsData from '@/data/questions.json';
import { storeI18n } from '@/lib/i18n';

export default function DiagnosePage() {
  const [currentDimIndex, setCurrentDimIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [enterprise, setEnterprise] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const dimensions = Object.entries(questionsData.dimensions);
  const currentDimCode = dimensions[currentDimIndex]?.[0];
  const currentDimName = dimensions[currentDimIndex]?.[1];
  const currentDimQuestions = questionsData.questions.filter(q => q.dim === currentDimCode);

  useEffect(() => {
    async function loadSaved() {
      const saved = await store.getDiagnosis();
      if (saved) {
        setEnterprise(saved.enterprise);
      }
    }
    loadSaved();
  }, []);

  const handleAnswer = (qId, val) => {
    setResponses(prev => ({ ...prev, [qId]: val }));
  };

  const nextDimension = () => {
    if (currentDimIndex < dimensions.length - 1) {
      setCurrentDimIndex(currentDimIndex + 1);
    } else {
      submitDiagnosis();
    }
  };

  const prevDimension = () => {
    if (currentDimIndex > 0) {
      setCurrentDimIndex(currentDimIndex - 1);
    }
  };

  const submitDiagnosis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enterpriseName: enterprise || 'Unnamed Enterprise', responses }),
      });
      const data = await res.json();
      setResult(data);
      await store.saveDiagnosis(data);
    } catch (e) {
      alert('Error submitting diagnosis');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white border-2 border-blue-800 p-12 shadow-2xl text-center mb-12">
            <span className="text-xs font-mono uppercase text-slate-500 tracking-widest">Full Diagnostic BHS Score</span>
            <div className="text-8xl font-bold text-blue-800 my-6 font-mono">{result.overallBHS}%</div>
            <h1 className="text-3xl font-serif font-bold text-slate-800 mb-4">{result.enterprise}</h1>
            <p className="text-slate-600">Comprehensive analysis of all 12 business health dimensions.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="clinical-card p-8">
              <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">Dimensional Breakdown</h2>
              <div className="space-y-6">
                {Object.entries(result.dimensionScores).map(([dim, score]) => (
                  <div key={dim} className="flex items-center gap-4">
                    <span className="w-12 font-mono text-sm text-slate-500">{dim}</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 transition-all" style={{ width: `${score}%` }}></div>
                    </div}
                    <span className="w-12 text-right font-mono text-sm font-bold">{score}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="clinical-card p-8">
              <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">Detected Patterns</h2>
              {result.detectedPatterns.length > 0 ? (
                <div className="space-y-4">
                  {result.detectedPatterns.map((p, idx) => (
                    <div key={idx} className="p-4 border-l-4 border-red-500 bg-red-50 rounded-r">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-red-800">{p.code}: {p.name}</span>
                        <span className="text-xs font-bold uppercase px-2 py-1 bg-red-200 text-red-800 rounded">{p.risk} Risk</span>
                      </div>
                      <p className="text-sm text-red-700">{p.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic">No critical patterns detected. Enterprise shows systemic balance.</p>
              )}
            </div>
          </div>

          <div className="mt-12 text-center flex flex-col items-center gap-4">
            <button
              onClick={() => {
                window.location.href = '/prescribe';
              }}
              className="btn-clinical btn-primary px-12 py-4 text-lg shadow-lg"
            >
              {storeI18n.t('common.prescribe')}
            </button>
            <button onClick={() => window.location.reload()} className="text-slate-500 font-medium hover:text-slate-800 transition">New Assessment</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto clinical-card p-12">
        {!enterprise ? (
          <div className="text-center">
            <h1 className="text-3xl font-serif font-bold text-blue-900 mb-4">{storeI18n.t('diagnose.title')}</h1>
            <p className="text-slate-600 mb-8">{storeI18n.t('diagnose.subtitle')}</p>
            <input
              type="text"
              placeholder={storeI18n.t('common.enterprise_name')}
              className="clinical-input mb-6 text-lg"
              value={enterprise}
              onChange={(e) => setEnterprise(e.target.value)}
            />
            <button
              disabled={!enterprise}
              onClick={() => setEnterprise(enterprise)}
              className="btn-clinical btn-primary w-full text-lg"
            >
              {storeI18n.t('diagnose.enter_suite')}
            </button>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <span className="text-xs font-mono text-slate-400 uppercase">Dimension {currentDimIndex + 1} / 12</span>
                <h2 className="text-2xl font-bold text-blue-900">{currentDimName}</h2>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono text-slate-500 uppercase">{enterprise}</span>
              </div>
            </div>

            <div className="space-y-8 mb-12">
              {currentDimQuestions.map((q, idx) => (
                <div key={q.id} className="p-6 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-lg font-medium text-slate-800 mb-4">{q.text}</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { text: 'Fully / Yes', val: 10 },
                      { text: 'Partially', val: 5 },
                      { text: 'No / Not at all', val: 0 },
                    ].map((opt, oIdx) => (
                      <button
                        key={oIdx}
                        onClick={() => handleAnswer(q.id, opt.val)}
                        className={`py-2 px-4 rounded border transition ${responses[q.id] === opt.val ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-4">
              <button
                disabled={currentDimIndex === 0}
                onClick={prevDimension}
                className="px-6 py-2 text-slate-500 font-medium disabled:opacity-30 hover:text-slate-800 transition"
              >
                {storeI18n.t('diagnose.prev')}
              </button>
              <button
                onClick={nextDimension}
                className="btn-clinical btn-primary px-8"
              >
                {currentDimIndex === dimensions.length - 1 ? storeI18n.t('diagnose.finish') : storeI18n.t('diagnose.next')}
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-800 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="font-mono text-sm text-slate-500 uppercase">{storeI18n.t('diagnose.loading')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
