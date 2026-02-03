import { useQuery } from "@tanstack/react-query";
import axios from "axios";

// Using process.env style via Vite's import.meta
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const useRaces = (year: number) => {
  return useQuery({
    queryKey: ["races", year],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/races`, {
        params: { year },
      });
      // We return data.data because our backend uses the { success, data } shape
      return response.data.data;
    },
  });
};