import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ForbiddenPage(): JSX.Element {
  return <Card className="mx-auto mt-16 max-w-xl text-center"><h1 className="text-3xl font-black tracking-tight">403</h1><p className="mt-4 text-zinc-500">You do not have permission to view this page.</p><Button asChild className="mt-4"><Link to="/dashboard">Go back</Link></Button></Card>;
}
