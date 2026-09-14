'use client';

import React, { useState, useEffect } from 'react';
import { store } from '@/lib/store';
import { storeI18n } from '@/lib/i18n';

export default function PrescribePage() {
  const [diagnosis, setDiagnosis] = useState(null);
  const [prescription, setPrescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    async function loadData() {
      const data = await store.getDiagnosis();
      if (!data) {
        window.location.href = '/diagnose';
      } else {
        setDiagnosis(data);
      }
    }
    loadData();
  }, []);

  const generatePrescription = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prescribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enterpriseName: diagnosis.enterprise,
          overallBHS: diagnosis.overallBHS,
          dimensionScores: diagnosis.dimensionScores,
          detectedPatterns: diagnosis.detectedPatterns,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPrescription(data.prescription);
      } else {
        alert('Error generating prescription');
      }
    } catch (e) {
      alert('API Error');
    } finally {
      setLoading(false);
    }
  };

  if (!diagnosis) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-blue-900">{storeI18n.t('prescribe.title')}</h1>
            <p className="text-slate-600">Enterprise: {diagnosis.enterprise}</p>
          </div>
          <button
            onClick={generatePrescription}
            disabled={loading}
            className="btn-clinical btn-primary"
          >
            {loading ? 'Generating...' : storeI18n.t('prescribe.generate')}
          </button>
        </div>

        <div className="bg-white border border-slate-300 shadow-sm min-h-[600px] p-12 relative">
          {!isApproved && prescription && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 opacity-10">
              <span className="text-6xl font-bold text-red-600 rotate-45 uppercase">{storeI18n.t('prescribe.pending')}</span>
            </div>
          )}

          {!prescription ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-500 font-mono uppercase text-sm">Waiting for AI Analysis...</p>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center border-b-2 border-blue-900 pb-4 mb-8">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-blue-900">BUSINESS PRESCRIPTION™</h2>
                  <p className="text-xs font-mono text-slate-500 uppercase">Document ID: BP-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-slate-500 block uppercase">Issued: {new Date().toLocaleDateString()}</span>
                  <span className="text-xs font-mono text-slate-500 block uppercase">Status: {isApproved ? storeI18n.t('prescribe.approved') : storeI18n.t('prescribe.draft')}</span>
                </div>
              </div>

              <div className="prose prose-slate max-w-none whitespace-pre-wrap font-serif text-lg leading-relaxed text-slate-800">
                {prescription}
              </div>
            </div>
          )}
        </div>

        {prescription && (
          <div className="mt-8 p-6 clinical-card flex items-center justify-between shadow-sm">
            <div>
              <h3 className="font-bold text-slate-800">{storeI18n.t('prescribe.gate_title')}</h3>
              <p className="text-sm text-slate-500">{storeI18n.t('prescribe.gate_desc')}</p>
            </div>
            <button
              onClick={() => setIsApproved(!isApproved)}
              className={`px-6 py-2 rounded font-bold transition ${isApproved ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
            >
              {isApproved ? '✓ Approved' : storeI18n.t('prescribe.approve_btn')}
            </button>
          </div>
        )}

        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={() => window.location.href = '/monitor'}
            className="btn-clinical btn-secondary px-8 py-3 font-bold"
          >
            Go to Vital Signs Monitor →
          </button>
        </div>
      </div>
    </div>
  );
}
