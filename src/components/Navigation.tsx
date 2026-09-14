'use client';

import React from 'react';
import Link from 'next/link';
import { Activity, Stethoscope, FileText, LineChart, LayoutDashboard } from 'lucide-react';

export default function Navigation() {
  const navItems = [
    { name: 'Health Check', href: '/check', icon: Activity },
    { name: 'Diagnosis', href: '/diagnose', icon: Stethoscope },
    { name: 'Prescription', href: '/prescribe', icon: FileText },
    { name: 'Monitor', href: '/monitor', icon: LineChart },
  ];

  return (
    <nav className="bg-blue-900 text-white font-mono text-xs tracking-widest uppercase">
      <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="font-bold">BH-OS v2.0 // SYSTEM READY</span>
        </div>
        <div className="flex gap-6">
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className="flex items-center gap-2 hover:text-blue-200 transition">
              <item.icon size={14} />
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
