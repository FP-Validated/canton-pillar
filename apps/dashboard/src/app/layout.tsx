import './globals.css'; import { Sidebar } from '../components/Sidebar';
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body><div className="flex min-h-screen"><Sidebar title="Pillar"/><main className="flex-1 p-6">{children}</main></div></body></html>; }
