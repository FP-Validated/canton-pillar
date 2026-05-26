import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
export const authOptions: NextAuthOptions = { providers: [], session: { strategy:'jwt' }, callbacks: { async session({ session, token }) { (session as any).tenantId = token.sub; return session; } } };
export const getDashboardSession = () => getServerSession(authOptions);
