'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Allow access to the login page without a session
    if (pathname === '/admin/login') return;

    const session = localStorage.getItem('admin_session');
    if (session !== 'active') {
      router.push('/admin/login');
    }
  }, [router, pathname]);

  return (
    <div className="admin-container">
      {children}
    </div>
  );
}
