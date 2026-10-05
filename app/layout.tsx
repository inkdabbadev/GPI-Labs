import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'GI Lab · Art. Light. Technology.',
  description: 'GI Lab transforms lakesides, parks, plazas and public spaces with art, light and immersive technology. Our new website is coming soon.',
  openGraph: {
    title: 'GI Lab · Art. Light. Technology.',
    description: 'A new experience is taking shape. Transforming spaces, inspiring people.',
    type: 'website'
  }
};

export const viewport: Viewport = { themeColor: '#05070c', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={sans.variable}><body>{children}</body></html>;
}
