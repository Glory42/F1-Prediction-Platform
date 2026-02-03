import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "@/modules/races/Dashboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevents refetching when window is refocused, saving API calls
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background p-8 font-sans antialiased">
        <div className="mx-auto max-w-7xl">
          <Dashboard />
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default App;