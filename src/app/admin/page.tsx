'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { store } from '@/lib/store';

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    const session = localStorage.getItem('admin_session');
    if (session !== 'active') {
      router.push('/admin/login');
      return;
    }

    async function fetchEnterprises() {
      try {
        const data = await store.getAllEnterprises();
        setEnterprises(data);
      } catch (e) {
        console.error('Failed to fetch enterprises', e);
      } finally {
        setLoading(false);
      }
    }
    fetchEnterprises();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('admin_session');
    router.push('/admin/login');
  };

  if (!mounted) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-800 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="font-mono text-sm text-slate-500 uppercase">Syncing Registry...</p>
        </div>
      </div>
    );
  }

  const avgBHS = enterprises.length
    ? Math.round(enterprises.reduce((acc, e) => acc + e.overall_bhs, 0) / enterprises.length)
    : 0;

  const criticalCount = enterprises.filter(e => e.overall_bhs < 50).length;

  return (
    <div className="min-h-screen bg-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-serif font-bold text-blue-900">Clinical Control Center</h1>
            <p className="text-slate-600 font-mono text-sm uppercase tracking-widest">Admin Oversight Dashboard</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white font-bold rounded-sm hover:bg-red-700 transition text-sm"
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="clinical-card p-6 bg-white border-l-4 border-blue-800 shadow-sm">
            <p className="text-xs font-mono text-slate-500 uppercase mb-2">Total Enterprises</p>
            <div className="text-4xl font-bold text-slate-800">{enterprises.length}</div>
          </div>
          <div className="clinical-card p-6 bg-white border-l-4 border-amber-500 shadow-sm">
            <p className="text-xs font-mono text-slate-500 uppercase mb-2">Avg. Systemic BHS</p>
            <div className="text-4xl font-bold text-slate-800">{avgBHS}%</div>
          </div>
          <div className="clinical-card p-6 bg-white border-l-4 border-red-600 shadow-sm">
            <p className="text-xs font-mono text-slate-500 uppercase mb-2">Critical Cases</p>
            <div className="text-4xl font-bold text-slate-800">{criticalCount}</div>
          </div>
        </div>

        <div className="clinical-card bg-white shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800">Enterprise Health Registry</h2>
            <span className="text-xs font-mono text-slate-400 uppercase">Live Supabase Sync</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs font-mono text-slate-500 uppercase">
                  <th className="p-4 border-b border-slate-200">Enterprise ID</th>
                  <th className="p-4 border-b border-slate-200">Enterprise Name</th>
                  <th className="p-4 border-b border-slate-200">BHS Score</th>
                  <th className="p-4 border-b border-slate-200">Health Status</th>
                  <th className="p-4 border-b border-slate-200">Last Checked</th>
                  <th className="p-4 border-b border-slate-200 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-700">
                {enterprises.map((e) => {
                  const status = e.overall_bhs < 50 ? 'Critical' : e.overall_bhs < 70 ? 'Fragile' : 'Stable';
                  return (
                    <tr key={e.id} className="hover:bg-slate-50 transition border-b border-slate-100">
                      <td className="p-4 font-mono text-xs">{e.id}</td>
                      <td className="p-4 font-bold text-slate-900">{e.enterprise_name}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${e.overall_bhs < 50 ? 'bg-red-500' : e.overall_bhs < 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${e.overall_bhs}%` }}
                            ></div>
                          </div>
                          <span className="font-mono font-bold">{e.overall_bhs}%</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                          status === 'Critical' ? 'bg-red-100 text-red-700' :
                          status === 'Fragile' ? 'bg-amber-100 text-amber-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500">{new Date(e.created_at).toLocaleDateString()}</td>
                      <td className="p-4 text-right">
                        <button className="text-blue-800 font-bold hover:underline mr-4">View Chart</button>
                        <button className="text-slate-500 hover:text-red-600 transition">Archive</button>
                      </td>
                    </tr>
                  );
                })}
                {enterprises.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-400 italic">
                      No enterprise records found in the registry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
