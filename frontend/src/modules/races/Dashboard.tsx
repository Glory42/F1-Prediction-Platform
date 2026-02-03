import { useState } from "react";
import { useRaces } from "@/hooks/useRaces";
import { RaceCard } from "@/components/RaceCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Dashboard = () => {
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const { data: races, isLoading, isError, error } = useRaces(Number(selectedYear));

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Race Schedule</h1>
          <p className="text-muted-foreground">
            Predicting winners for the {selectedYear} Formula 1 Season.
          </p>
        </div>
        <div className="w-[180px]">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger>
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 11 }, (_, i) => 2026 - i).map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year} Season
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-lg font-medium text-muted-foreground">
              Loading {selectedYear} Season...
            </p>
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <h2 className="text-lg font-semibold text-destructive">Failed to load races</h2>
          <p className="text-sm text-destructive/80">{(error as any)?.message || "Internal Server Error"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {races?.map((race: any) => (
            <RaceCard key={race.id} race={race} />
          ))}
          
          {races?.length === 0 && (
            <p className="col-span-full py-10 text-center text-muted-foreground">
              No races found for {selectedYear}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};