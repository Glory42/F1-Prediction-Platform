import { useState, useEffect, useMemo, useRef } from 'react';

export interface CompareLocationAdapter {
  getSearchParams(): URLSearchParams;
  getPathname(): string;
  replaceUrl(url: string): void;
}

const browserLocationAdapter: CompareLocationAdapter = {
  getSearchParams: () => new URLSearchParams(window.location.search),
  getPathname: () => window.location.pathname,
  replaceUrl: (url) => window.history.replaceState({}, '', url),
};

interface CompareControllerConfig<T extends { id: number }, TDetail, TYearStats> {
  years: number[];
  defaultYear: number;
  initialItems: T[];
  allItems: T[];
  entityLabel: string;
  fetchItemsForYear: (year: number) => Promise<T[]>;
  fetchDetail: (id: number, year: number) => Promise<TDetail>;
  fetchCareer: (id: number) => Promise<TYearStats[]>;
}

export type CompareResult<TDetail, TYearStats> =
  | { mode: 'season'; a: TDetail; b: TDetail }
  | { mode: 'career'; a: TYearStats[]; b: TYearStats[] };

export interface CompareControllerActions {
  setYear: (year: number) => void;
  setAId: (id: number) => void;
  setBId: (id: number) => void;
  setIsCareer: (isCareer: boolean) => void;
}

export interface CompareControllerResult<T, TDetail, TYearStats> {
  year: number;
  items: T[];
  aId: number;
  bId: number;
  itemA: T | undefined;
  itemB: T | undefined;
  isCareer: boolean;
  comparison: CompareResult<TDetail, TYearStats> | null;
  loading: boolean;
  error: string | null;
  actions: CompareControllerActions;
}

export function useCompareController<T extends { id: number }, TDetail, TYearStats>(
  {
    defaultYear,
    initialItems,
    allItems,
    entityLabel,
    fetchItemsForYear,
    fetchDetail,
    fetchCareer,
  }: CompareControllerConfig<T, TDetail, TYearStats>,
  locationAdapter: CompareLocationAdapter = browserLocationAdapter
): CompareControllerResult<T, TDetail, TYearStats> {
  const [year, setYear] = useState<number>(defaultYear);
  const [items, setItems] = useState<T[]>(initialItems);
  const [aId, setAId] = useState<number>(initialItems[0]?.id || 0);
  const [bId, setBId] = useState<number>(initialItems[1]?.id || initialItems[0]?.id || 0);
  const [isCareer, setIsCareer] = useState<boolean>(false);

  const [seasonA, setSeasonA] = useState<TDetail | null>(null);
  const [seasonB, setSeasonB] = useState<TDetail | null>(null);
  const [careerA, setCareerA] = useState<TYearStats[] | null>(null);
  const [careerB, setCareerB] = useState<TYearStats[] | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // The mount-hydration effect (below) sets `year` from the URL, which also
  // triggers the year-tracking effect (also below) to re-fetch that year's
  // items. Rather than both effects independently fetching the same year (a
  // race where the year-tracking effect's fetch callback closes over a stale
  // aId/bId and can clobber the URL's a/b params), the mount effect stashes
  // its desired a/b here and the year-tracking effect's single fetch applies
  // them once — one fetch, one place that resolves the final aId/bId.
  const pendingHydrationRef = useRef<{ aId?: number; bId?: number } | null>(null);

  useEffect(() => {
    const params = locationAdapter.getSearchParams();
    const paramYear = params.get('year');
    const paramA = params.get('a');
    const paramB = params.get('b');
    const paramCareer = params.get('career');

    const isCareerMode = paramCareer === 'true';
    if (paramYear) setYear(parseInt(paramYear));
    if (isCareerMode) setIsCareer(true);

    if (isCareerMode) {
      setItems(allItems);
      if (paramA) setAId(parseInt(paramA));
      if (paramB) setBId(parseInt(paramB));
    } else if (paramYear && parseInt(paramYear) !== defaultYear) {
      // Let the year-tracking effect perform the fetch for this year; hand it
      // the a/b ids to apply once that fetch resolves.
      pendingHydrationRef.current = {
        aId: paramA ? parseInt(paramA) : undefined,
        bId: paramB ? parseInt(paramB) : undefined,
      };
    } else {
      if (paramA) setAId(parseInt(paramA));
      if (paramB) setBId(parseInt(paramB));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isCareer) {
      setItems(allItems);
      return;
    }

    let active = true;
    if (year === defaultYear) {
      setItems(initialItems);
      if (initialItems.length > 0) {
        if (!initialItems.some((i) => i.id === aId)) setAId(initialItems[0].id);
        if (!initialItems.some((i) => i.id === bId)) setBId(initialItems[1]?.id || initialItems[0].id);
      }
      return;
    }
    fetchItemsForYear(year)
      .then((data) => {
        if (!active) return;
        setItems(data);
        if (data.length === 0) return;

        const pending = pendingHydrationRef.current;
        pendingHydrationRef.current = null;

        if (pending?.aId !== undefined) setAId(pending.aId);
        else if (!data.some((i) => i.id === aId)) setAId(data[0].id);

        if (pending?.bId !== undefined) setBId(pending.bId);
        else if (!data.some((i) => i.id === bId)) setBId(data[1]?.id || data[0].id);
      })
      .catch((err) => {
        console.error(`Failed to load ${entityLabel} for year`, year, err);
      });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCareer, year, initialItems, allItems, defaultYear]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('year', year.toString());
    params.set('a', aId.toString());
    params.set('b', bId.toString());
    if (isCareer) params.set('career', 'true');

    const newUrl = `${locationAdapter.getPathname()}?${params.toString()}`;
    locationAdapter.replaceUrl(newUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, aId, bId, isCareer]);

  useEffect(() => {
    if (!aId || !bId) return;

    let active = true;
    setLoading(true);
    setError(null);

    const promises: Promise<TDetail | TYearStats[]>[] = isCareer
      ? [fetchCareer(aId), fetchCareer(bId)]
      : [fetchDetail(aId, year), fetchDetail(bId, year)];

    Promise.all(promises)
      .then(([resA, resB]) => {
        if (!active) return;
        if (isCareer) {
          setCareerA(resA as TYearStats[]);
          setCareerB(resB as TYearStats[]);
          setSeasonA(null);
          setSeasonB(null);
        } else {
          setSeasonA(resA as TDetail);
          setSeasonB(resB as TDetail);
          setCareerA(null);
          setCareerB(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch details');
        setLoading(false);
      });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aId, bId, year, isCareer]);

  const itemA = useMemo(() => items.find((i) => i.id === aId), [items, aId]);
  const itemB = useMemo(() => items.find((i) => i.id === bId), [items, bId]);

  const comparison = useMemo<CompareResult<TDetail, TYearStats> | null>(() => {
    if (!isCareer && seasonA && seasonB) return { mode: 'season', a: seasonA, b: seasonB };
    if (isCareer && careerA && careerB) return { mode: 'career', a: careerA, b: careerB };
    return null;
  }, [isCareer, seasonA, seasonB, careerA, careerB]);

  return {
    year,
    items,
    aId,
    bId,
    itemA,
    itemB,
    isCareer,
    comparison,
    loading,
    error,
    actions: { setYear, setAId, setBId, setIsCareer },
  };
}
