import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Neon Circuit Lab', description: 'Prototype local de piste vivante pour table multitouch.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
