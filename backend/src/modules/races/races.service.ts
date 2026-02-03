import { supabase } from '../../shared/configs/supabase';

export class RacesService {
    async getAllRaces(year: number) {
        const { data, error } = await supabase
            .from('races')
            .select(`
                *,
                predictions (
                    predicted_winner:drivers!predicted_winner_id (
                        id, full_name, team_name, team_colour
                    ),
                    actual_winner:drivers!actual_winner_id (
                        id, full_name, team_name, team_colour
                    )
                )
            `)
            .eq('year', year)
            .order('race_date', { ascending: true });

        if (error) throw error;

        return data;
    }

    async getRaceById(id: string) {
        const { data, error } = await supabase
            .from('races')
            .select('*, predictions(*)')
            .eq('id', id)
            .single();

        if (error) throw error;

        return data;
    }

    async updateRaceStatus(id: string, status: 'upcoming' | 'qualifying_done' | 'completed') {
        const { data, error } = await supabase
            .from('races')
            .update({status})
            .eq('id', id);

        if (error) throw error;

        return data;
    }
}