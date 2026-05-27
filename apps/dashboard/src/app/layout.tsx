import './globals.css';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Sidebar } from '../components/Sidebar';
import { NetworkSwitcher } from '../components/NetworkSwitcher';
import { getDashboardSession } from '../server/session';

function isPublicPath(pathname: string) {
  return pathname === '/login'
    || pathname.startsWith('/api/auth/')
    || pathname.startsWith('/_next/')
    || pathname === '/favicon.ico'
    || pathname === '/robots.txt'
    || pathname === '/sitemap.xml'
    || /\.(?:css|js|map|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|otf)$/.test(pathname);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = headers().get('x-pathname') ?? headers().get('x-invoke-path') ?? headers().get('next-url') ?? '/';
  const session = await getDashboardSession();
  if (session === null && !isPublicPath(pathname)) redirect('/login');
  return <html><body><div className="flex min-h-screen"><Sidebar title="Pillar"/><main className="flex-1 p-6"><div className="mb-6 flex justify-end"><NetworkSwitcher /></div>{children}</main></div></body></html>;
}
