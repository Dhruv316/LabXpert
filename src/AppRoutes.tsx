import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { BenchScreen } from './ui/screens/BenchScreen';
import { LoginScreen } from './ui/screens/LoginScreen';
import { NotFoundScreen } from './ui/screens/NotFoundScreen';
import { PickerScreen } from './ui/screens/PickerScreen';
import { PracticeScreen } from './ui/screens/PracticeScreen';
import { ProgressScreen } from './ui/screens/ProgressScreen';
import { ResultScreen } from './ui/screens/ResultScreen';
import { RequireUser } from './ui/shell/RequireUser';
import { Shell } from './ui/shell/Shell';

// Only in `npm run dev`: the constant is replaced at build time, so the import is dropped from production.
const Gallery = import.meta.env.DEV ? lazy(() => import('./components/ui/Gallery')) : undefined;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route element={<RequireUser />}>
        <Route element={<Shell />}>
          <Route index element={<PickerScreen />} />
          <Route path="experiment/:id" element={<BenchScreen />} />
          <Route path="result/:attemptId" element={<ResultScreen />} />
          <Route path="practice/:taskId" element={<PracticeScreen />} />
          <Route path="progress" element={<ProgressScreen />} />
        </Route>
      </Route>
      {Gallery !== undefined && (
        <Route
          path="/gallery"
          element={
            <Suspense fallback={null}>
              <Gallery />
            </Suspense>
          }
        />
      )}
      <Route
        path="*"
        element={
          <div className="flex min-h-screen flex-col bg-cream">
            <NotFoundScreen />
          </div>
        }
      />
    </Routes>
  );
}
