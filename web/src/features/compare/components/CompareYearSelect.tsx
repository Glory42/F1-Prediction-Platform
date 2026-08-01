interface Props {
  years: number[];
  year: number;
  setYear: (year: number) => void;
}

export function CompareYearSelect({ years, year, setYear }: Props) {
  return (
    <select
      value={year}
      onChange={(e) => setYear(parseInt(e.target.value))}
      className="bg-black border border-white/[0.08] text-white text-xs font-mono px-3 py-2 uppercase tracking-wider focus:outline-none focus:border-[#a855f7]/40"
    >
      {years.map((y) => (
        <option key={y} value={y}>{y} Season</option>
      ))}
    </select>
  );
}
