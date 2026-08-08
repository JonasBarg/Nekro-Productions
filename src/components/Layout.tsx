import ItemSelector from './ItemSelector';
import RateInput from './RateInput';
import ModifierSelector from './ModifierSelector';
import ProductionGraph from './ProductionGraph';
import RecipeSelector from './RecipeSelector';
import SummaryPanel from './SummaryPanel';

export default function Layout() {
  return (
    <div className="flex min-h-screen w-full flex-col gap-4 bg-bg p-4">
      <nav className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <ItemSelector />
        <RateInput />
        <ModifierSelector />
      </nav>

      <main className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <div className="lg:flex-1">
          <ProductionGraph />
          <div className="mt-4 flex flex-col items-center gap-1">
            <h1
              className="text-4xl font-extrabold text-text-primary leading-tight"
              style={{
                fontFamily: "'Noto Sans JP', 'Kosugi Maru', 'Sawarabi Mincho', serif",
                letterSpacing: '0.04em',
                textShadow: '0 6px 18px rgba(0,0,0,0.55)',
              }}
            >
              ネクロのプロダクション
            </h1>
            <h2 className="text-sm text-text-secondary" style={{ fontFamily: 'var(--font-sans)' }}>
              Nekro's Productions
            </h2>
          </div>
        </div>
        <aside className="flex w-full flex-col gap-4 lg:max-w-md">
          <RecipeSelector />
          <SummaryPanel />
        </aside>
      </main>
    </div>
  );
}
