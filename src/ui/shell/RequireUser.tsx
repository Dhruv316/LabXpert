import { Navigate, Outlet } from 'react-router-dom';
import { useAppStore } from '../../state';

/** Route guard: no logged-in user means the login screen. Real login arrives in Part 7. */
export function RequireUser() {
  const user = useAppStore((state) => state.user);
  if (user === undefined) return <Navigate to="/login" replace />;
  return <Outlet />;
}
