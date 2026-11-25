import { Outlet, useLocation } from 'react-router-dom';
import { cn, useMotionReduced } from '../../components/ui';
import { TopBar } from './TopBar';

/** The frame every screen after login sits in. A change of screen is one 220 ms fade (DESIGN.md §10). */
export function Shell() {
  const { pathname } = useLocation();
  const reduced = useMotionReduced();
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <TopBar />
      <div key={pathname} className={cn('flex flex-1 flex-col', !reduced && 'animate-fade-in')}>
        <Outlet />
      </div>
    </div>
  );
}
