'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Stethoscope, FileText, LineChart, Globe } from 'lucide-react';
import { storeI18n } from '@/lib/i18n';

export default function Navigation() {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    setLang(storeI18n.getLanguage());
  }, []);

  const toggleLanguage = () => {
    const newLang = lang === 'en' ? 'fr' : 'en';
    storeI18n.setLanguage(newLang);
  };

  const navItems = [
    { name: storeI18n.t('common.diagnose'), href: '/diagnose', icon: Stethoscope },
    { name: storeI18n.t('common.prescribe'), href: '/prescribe', icon: FileText },
    { name: storeI18n.t('common.monitor'), href: '/monitor', icon: LineChart },
  ];

  return (
    <nav className="bg-blue-900 text-white font-mono text-xs tracking-widest uppercase">
      <div className="max-w-6xl mx-auto px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="font-bold">BH-OS v2.0 // SYSTEM READY</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-6">
            {navItems.map(item => (
              <Link key={item.href} href={item.href} className="flex items-center gap-2 hover:text-blue-200 transition">
                <item.icon size={14} />
                {item.name}
              </Link>
            ))}
          </div>
          <div className="h-4 w-px bg-blue-700 mx-2"></div>
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 hover:text-blue-200 transition font-bold"
          >
            <Globe size={14} />
            {lang === 'en' ? 'FR' : 'EN'}
          </button>
        </div>
      </div>
    </nav>
  );
}
