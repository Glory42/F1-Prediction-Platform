// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { useGlobalSearch } from '@/features/search/useGlobalSearch';
import { server } from '../../../support/msw/server';

const API_URL = 'http://localhost:8787';

function pressCtrlK() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
}

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
}

describe('useGlobalSearch', () => {
  it('is closed until opened', () => {
    const { result } = renderHook(() => useGlobalSearch());
    expect(result.current.isVisible).toBe(false);
  });

  it('opens on ctrl+k and populates results from the search endpoint', async () => {
    const { result } = renderHook(() => useGlobalSearch());

    act(() => pressCtrlK());
    expect(result.current.isVisible).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results.drivers).toHaveLength(1);
    expect(result.current.results.teams).toHaveLength(1);
    expect(result.current.results.circuits).toHaveLength(1);
  });

  it('does not refetch once results have already been fetched', async () => {
    let callCount = 0;
    server.use(
      http.get(`${API_URL}/api/search`, () => {
        callCount++;
        return HttpResponse.json({ data: { drivers: [], teams: [], circuits: [] }, error: null });
      })
    );

    const { result } = renderHook(() => useGlobalSearch());

    act(() => pressCtrlK());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.close());
    await waitFor(() => expect(result.current.isVisible).toBe(false));

    act(() => pressCtrlK());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    expect(callCount).toBe(1);
  });

  it('closes on Escape', async () => {
    const { result } = renderHook(() => useGlobalSearch());

    act(() => pressCtrlK());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    act(() => pressEscape());
    await waitFor(() => expect(result.current.isVisible).toBe(false));
  });

  it('opens via the open-global-search window event', () => {
    const { result } = renderHook(() => useGlobalSearch());

    act(() => window.dispatchEvent(new Event('open-global-search')));

    expect(result.current.isVisible).toBe(true);
  });
});
