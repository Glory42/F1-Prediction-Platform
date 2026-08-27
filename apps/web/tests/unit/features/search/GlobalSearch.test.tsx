// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GlobalSearch } from '@/features/search/components/GlobalSearch';

describe('GlobalSearch', () => {
  it('renders nothing until opened, then shows fetched results', async () => {
    render(<GlobalSearch />);

    expect(screen.queryByPlaceholderText(/search drivers/i)).not.toBeInTheDocument();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));

    await waitFor(() => expect(screen.getByPlaceholderText(/search drivers/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Max Verstappen')).toBeInTheDocument());
    expect(screen.getByText('Ferrari')).toBeInTheDocument();
    expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();
  });
});
