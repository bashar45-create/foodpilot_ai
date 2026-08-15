import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function NotFoundPage(): JSX.Element {
  return <Card className="mx-auto mt-16 max-w-xl text-center"><h1 className="text-3xl font-black tracking-tight">404</h1><p className="mt-4 text-zinc-500">This page does not exist.</p><Button asChild className="mt-4"><Link to="/dashboard">Return to dashboard</Link></Button></Card>;
}
