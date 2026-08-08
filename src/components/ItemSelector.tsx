import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { usePlannerStore } from '../stores/plannerStore';
import { allItems, getItem, isCraftable } from '../data';
import type { Item } from '../data/types';

const TARGET_ITEMS = allItems.filter((i) => isCraftable(i.id));

function fuzzyMatch(query: string, name: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n.includes(q)) return n.startsWith(q) ? 0 : 0.5;
  // ordered char match
  let j = 0;
  for (let i = 0; i < n.length && j < q.length; i++) {
    if (n[i] === q[j]) j++;
  }
  return j === q.length ? 2 : -1;
}

export default function ItemSelector() {
  const targetId = usePlannerStore((s) => s.targetItemId);
  const setTarget = usePlannerStore((s) => s.setTarget);
  const current = targetId ? getItem(targetId) : null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    // If no query, show a larger alphabetical list so the user can browse
    // rather than only seeing the very first few items.
    if (!query.trim()) {
      return TARGET_ITEMS.slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({ item, score: 0 }));
    }

    const results: Array<{ item: Item; score: number }> = [];
    for (const item of TARGET_ITEMS) {
      const score = fuzzyMatch(query, item.name);
      if (score >= 0) results.push({ item, score });
    }
    results.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
    return results.slice(0, 12);
  }, [query]);

  const select = (item: Item) => {
    setTarget(item.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-[260px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-card px-3 py-2 text-left text-sm text-text-primary shadow-sm hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <span className="flex items-center gap-2">
          <span className="truncate">{current ? current.name : 'Select item...'}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-text-secondary" />
      </button>

      {open && (
        <div className="absolute top-12 z-20 w-full overflow-hidden rounded-md border border-border bg-bg-card shadow-lg ring-2 ring-accent">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-4 w-4 text-text-secondary" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items..."
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded p-0.5 text-text-secondary hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <ul className="max-h-72 overflow-y-auto p-1 text-sm">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-sm text-text-secondary">No matches</li>
            ) : (
              filtered.map(({ item }) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(item);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-bg transition-colors"
                  >
                    <span className="flex-1 truncate">{item.name}</span>
                    {item.isFluid && <span className="text-xs text-fluid">💧</span>}
                    {item.isRaw && <span className="text-xs text-raw">⛏️</span>}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
