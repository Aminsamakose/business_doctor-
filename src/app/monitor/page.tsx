'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { store } from '@/lib/store';
import { storeI18n } from '@/lib/i18n';

export default function MonitorPage() {
  const [diagnosis, setDiagnosis] = useState(null);
  const [history, setHistory] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [newVitals, setNewVitals] = useState({
    D1: 50, D2: 50, D3: 50, D4: 50, D5: 50, D6: 50, D7: 50, D8: 50, D9: 50, D10: 50, D11: 50, D12: 50
  });

  useEffect(() => {
    async function loadAll() {
      const savedDiag = await store.getDiagnosis();
      if (!savedDiag) {
        window.location.href = '/diagnose';
        return;
      }
      setDiagnosis(savedDiag);

      const savedVitals = await store.getVitals();
      if (savedVitals.length === 0) {
        const day0 = {
          day: 'Day 0',
          bhs: savedDiag.overallBHS,
          ...savedDiag.dimensionScores
        };
        setHistory([day0]);
        await store.saveVitals([day0]);
      } else {
        setHistory(savedVitals);
      }
    }
    loadAll();
  }, []);

  const logVitals = async () => {
    const currentBHS = Math.round(Object.values(newVitals).reduce((a, b) => a + b, 0) / 12);
    const newEntry = {
      day: `Day ${history.length * 30}`,
      bhs: currentBHS,
      ...newVitals
    };
    const updatedHistory = [...history, newEntry];
    setHistory(updatedHistory);
    await store.saveVitals(updatedHistory);
    setShowLogForm(false);
  };

  if (!diagnosis) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-serif font-bold text-blue-900">{storeI18n.t('monitor.title')}</h1>
            <p className="text-slate-600">{storeI18n.t('monitor.subtitle')}: {diagnosis.enterprise}</p>
          </div>
          <button
            onClick={() => setShowLogForm(!showLogForm)}
            className="btn-clinical btn-primary"
          >
            {showLogForm ? 'Cancel' : storeI18n.t('monitor.log_vitals')}
          </button>
        </div>

        {showLogForm && (
          <div className="mb-12 clinical-card p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Input Current Vital Signs (%)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {Object.entries(newVitals).map(([dim, val]) => (
                <div key={dim} className="flex flex-col gap-2">
                  <label className="text-xs font-mono text-slate-500 uppercase">{dim}</label>
                  <input
                    type="number"
                    min="0" max="100"
                    value={val}
                    onChange={(e) => setNewVitals({...newVitals, [dim]: parseInt(e.target.value) || 0})}
                    className="clinical-input"
                  />
                </div>
              ))}
            </div>
            <div className="mt-8 flex justify-end">
              <button onClick={logVitals} className="btn-clinical btn-primary px-8">{storeI18n.t('monitor.commit')}</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 clinical-card p-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6">BHS Recovery Trend</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                    itemStyle={{ color: '#1e40af', fontWeight: 'bold' }}
                  />
                  <Line type="monotone" dataKey="bhs" stroke="#1e40af" strokeWidth={3} dot={{ r: 6, fill: '#1e40af' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="clinical-card p-8">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Current Health State</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={Object.entries(history[history.length-1]).filter(([k]) => k !== 'day' && k !== 'bhs').map(([k, v]) => ({ subject: k, A: v as number }))}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Current" dataKey="A" stroke="#1e40af" fill="#1e40af" fillOpacity={0.6} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-8 clinical-card p-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Recovery Analysis</h3>
          <div className="flex gap-8 items-start">
            <div className="p-4 bg-blue-50 border-l-4 border-blue-800 rounded flex-1">
              <p className="text-sm text-blue-900 leading-relaxed">
                The enterprise is showing a <strong style={{color: 'var(--color-primary)'}}>{history[history.length-1].bhs - history[0].bhs}% increase</strong> in overall health since Day 0.
                The most significant recovery is seen in <strong style={{color: 'var(--color-primary)'}}>{Object.entries(history[history.length-1]).filter(([k]) => k !== 'day' && k !== 'bhs').sort((a,b) => (b[1] as number) - (a[1] as number))[0][0]}</strong>.
              </p>
            </div>
            <div className="p-4 bg-amber-50 border-l-4 border-amber-600 rounded flex-1">
              <p className="text-sm text-amber-900 leading-relaxed">
                Attention required for <strong style={{color: 'var(--color-accent)'}}>{Object.entries(history[history.length-1]).filter(([k]) => k !== 'day' && k !== 'bhs').sort((a,b) => (a[1] as number) - (b[1] as number))[0][0]}</strong>, which remains the primary bottleneck to systemic resilience.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
