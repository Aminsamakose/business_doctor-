import './globals.css';
import Navigation from '@/components/Navigation';
import { Inter, Fraunces } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${fraunces.variable}`}>
        <Navigation />
        <main className="min-h-screen">
          {children}
        </main>
        <footer className="bg-slate-100 border-t border-slate-200 py-8 text-center font-mono text-xs text-slate-500 uppercase tracking-widest">
          &copy; 2026 SAMAKOSE ACCELERATOR LAB &bull; TAMALE, GHANA &bull; VISION2036
        </footer>
      </body>
    </html>
  );
}
