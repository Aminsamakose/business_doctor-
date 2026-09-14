'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // In a production app, this would be a server-side check.
    // For the prototype, we use a simple constant.
    if (password === 'BusinessDoctor2026') {
      localStorage.setItem('admin_session', 'active');
      router.push('/admin');
    } else {
      setError('Invalid admin credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-12 shadow-2xl rounded-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-serif font-bold text-blue-900 mb-2">Consultant Access</h1>
          <p className="text-slate-500 text-sm uppercase font-mono tracking-widest">Secure Entry Gate</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-xs font-mono text-slate-500 uppercase mb-2">Admin Password</label>
            <input
              type="password"
              className="w-full p-3 border border-slate-300 rounded-sm focus:ring-2 focus:ring-blue-800 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center font-medium">{error}</p>}

          <button type="submit" className="w-full py-3 bg-blue-800 text-white font-bold rounded-sm hover:bg-blue-700 transition">
            Unlock Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
