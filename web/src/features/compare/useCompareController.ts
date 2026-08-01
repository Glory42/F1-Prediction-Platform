import { useState, useEffect, useMemo } from 'react';

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

export function useCompareController<T extends { id: number }, TDetail, TYearStats>({
  defaultYear,
  initialItems,
  allItems,
  entityLabel,
  fetchItemsForYear,
  fetchDetail,
  fetchCareer,
}: CompareControllerConfig<T, TDetail, TYearStats>) {
  const [year, setYear] = useState<number>(defaultYear);
  const [items, setItems] = useState<T[]>(initialItems);
  const [aId, setAId] = useState<number>(initialItems[0]?.id || 0);
  const [bId, setBId] = useState<number>(initialItems[1]?.id || initialItems[0]?.id || 0);
  const [isCareer, setIsCareer] = useState<boolean>(false);

  const [aData, setAData] = useState<TDetail | null>(null);
  const [bData, setBData] = useState<TDetail | null>(null);
  const [aCareer, setACareer] = useState<TYearStats[] | null>(null);
  const [bCareer, setBCareer] = useState<TYearStats[] | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
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
      const targetYear = parseInt(paramYear);
      fetchItemsForYear(targetYear)
        .then((list) => {
          setItems(list);
          if (paramA) setAId(parseInt(paramA));
          else if (list[0]) setAId(list[0].id);

          if (paramB) setBId(parseInt(paramB));
          else if (list[1]) setBId(list[1].id);
        })
        .catch((err) => console.error(`Failed to load ${entityLabel} for url year`, err));
    } else {
      if (paramA) setAId(parseInt(paramA));
      if (paramB) setBId(parseInt(paramB));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update items list if year or mode changes
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
        if (data.length > 0) {
          if (!data.some((i) => i.id === aId)) setAId(data[0].id);
          if (!data.some((i) => i.id === bId)) setBId(data[1]?.id || data[0].id);
        }
      })
      .catch((err) => {
        console.error(`Failed to load ${entityLabel} for year`, year, err);
      });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCareer, year, initialItems, allItems, defaultYear]);

  // Sync state to URL parameters
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('year', year.toString());
    params.set('a', aId.toString());
    params.set('b', bId.toString());
    if (isCareer) params.set('career', 'true');

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [year, aId, bId, isCareer]);

  // Fetch detail stats when selected items or mode changes
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
          setACareer(resA as TYearStats[]);
          setBCareer(resB as TYearStats[]);
          setAData(null);
          setBData(null);
        } else {
          setAData(resA as TDetail);
          setBData(resB as TDetail);
          setACareer(null);
          setBCareer(null);
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

  return {
    year, setYear,
    items,
    aId, setAId,
    bId, setBId,
    isCareer, setIsCareer,
    itemA, itemB,
    aData, bData,
    aCareer, bCareer,
    loading, error,
  };
}
