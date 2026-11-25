/** Stand-in for a screen that arrives in a later part: only its title, from t(). */
export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-8">
      <h1 className="font-heading text-[2rem] font-semibold leading-10 text-ink">{title}</h1>
    </main>
  );
}
