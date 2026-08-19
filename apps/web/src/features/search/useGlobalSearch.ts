import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Driver, Team, Circuit } from "@/types";

interface GlobalSearchResults {
  drivers: Driver[];
  teams: Team[];
  circuits: Circuit[];
}

const EMPTY_RESULTS: GlobalSearchResults = { drivers: [], teams: [], circuits: [] };

export function useGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  function close() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (openRef.current) {
          close();
        } else {
          setOpen(true);
        }
      } else if (e.key === "Escape" && openRef.current) {
        close();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("open-global-search", handleOpen);
    return () => window.removeEventListener("open-global-search", handleOpen);
  }, []);

  useEffect(() => {
    if (open && !hasFetched) {
      const fetchData = async () => {
        setLoading(true);
        try {
          const data = await api.getGlobalSearch();
          setResults(data);
          setHasFetched(true);
        } catch (error) {
          console.error("Failed to fetch search data", error);
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [open, hasFetched]);

  function selectResult(url: string) {
    window.location.assign(url);
    setTimeout(() => setOpen(false), 100);
  }

  return {
    isVisible: open || closing,
    closing,
    results,
    loading,
    close,
    selectResult,
  };
}
