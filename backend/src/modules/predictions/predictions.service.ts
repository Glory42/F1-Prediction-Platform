import { supabase } from '../../shared/configs/supabase';
import { z } from 'zod';

// Define Zod schema for the race_data row with joins
const RaceDataRowSchema = z.object({
    grid_position: z.number().nullable(),
    fp2_avg_lap_time_ms: z.number().nullable(),
    historical_track_rank: z.number().nullable(),
    season_entries: z.object({
        drivers: z.object({
            id: z.string(),
            full_name: z.string(),
        }),
        teams: z.object({
            name: z.string(),
        })
    })
});

type DriverScore = {
    driverId: string;
    fullName: string;
    teamName: string;
    score: number;
    details: {
        gridScore: number;
        paceScore: number;
        historyScore: number;
    }
};

export class PredictionService {
    async getPredictionByRace(raceId: string) {
        // 1. Fetch Prediction + Race Year + Basic Driver Info
        // Note: We don't fetch team info from drivers table anymore
        const { data: prediction, error } = await supabase
            .from('predictions')
            .select(`
                *,
                race:races!race_id (
                    year
                ),
                predicted_driver:drivers!predicted_winner_id (
                    id, full_name
                ),
                actual_driver:drivers!actual_winner_id (
                    id, full_name
                )
            `)
            .eq('race_id', raceId)
            .single();
        
        if (error) throw error;
        if (!prediction) return null;

        const year = prediction.race.year;

        // 2. Fetch Team Info from Season Entries (History Correct)
        const getTeamInfo = async (driverId: string) => {
            if (!driverId) return null;
            const { data: entry } = await supabase
                .from('season_entries')
                .select('teams(name, team_colour)')
                .eq('year', year)
                .eq('driver_id', driverId)
                .maybeSingle(); // Use maybeSingle as entry might not exist if sync failed
            
            // Supabase returns nested object: { teams: { name: ..., team_colour: ... } }
            // But sometimes it returns array if not single? .single() ensures object.
            // If teams is null (failed join), we handle it.
            return entry?.teams || { name: 'Unknown', team_colour: '#333333' };
        };

        const [predictedTeam, actualTeam] = await Promise.all([
            getTeamInfo(prediction.predicted_winner_id),
            getTeamInfo(prediction.actual_winner_id)
        ]);

        // 3. Construct Response compatible with frontend
        return {
            ...prediction,
            predicted_winner: prediction.predicted_driver ? {
                ...prediction.predicted_driver,
                team_name: predictedTeam?.name,
                team_colour: predictedTeam?.team_colour
            } : null,
            actual_winner: prediction.actual_driver ? {
                ...prediction.actual_driver,
                team_name: actualTeam?.name,
                team_colour: actualTeam?.team_colour
            } : null
        };
    }

    async calculateWinner(raceId: number) {
        // 1. Check if prediction exists
        const { data: existing } = await supabase
            .from('predictions')
            .select('*')
            .eq('race_id', raceId)
            .maybeSingle();

        if (existing) {
            return existing;
        }

        // 2. Fetch race data with joins
        const { data: statsRaw, error: statsError } = await supabase
            .from('race_data')
            .select(`
                grid_position, 
                fp2_avg_lap_time_ms, 
                historical_track_rank,
                season_entries (
                    drivers (
                        id,
                        full_name
                    ),
                    teams (
                        name
                    )
                )
            `)
            .eq('race_id', raceId);

        if (statsError || !statsRaw || statsRaw.length === 0) {
            throw new Error(`Insufficient data to generate prediction for race ${raceId}`);
        }

        // 3. Process and Normalize Data (Calculate FP2 Rank)
        const validPace = statsRaw
            .filter(d => d.fp2_avg_lap_time_ms !== null)
            .sort((a, b) => (a.fp2_avg_lap_time_ms!) - (b.fp2_avg_lap_time_ms!));
        
        const paceRankMap = new Map<string, number>();
        validPace.forEach((d: any, index) => {
            const driverId = d.season_entries?.drivers?.id;
            if (driverId) {
                paceRankMap.set(driverId, index + 1);
            }
        });
        
        // 4. Calculate Weighted Scores (Lower is Better)
        const scores: DriverScore[] = [];

        for (const row of statsRaw) {
            try {
                const safeRow = RaceDataRowSchema.parse(row);
                const driverId = safeRow.season_entries.drivers.id;
                
                const gridRank = safeRow.grid_position ?? 20; 
                const histRank = safeRow.historical_track_rank ?? 20;
                const paceRank = paceRankMap.get(driverId) ?? 20;

                const gridScore = gridRank * 0.50;
                const paceScore = paceRank * 0.30;
                const historyScore = histRank * 0.20;

                const totalScore = gridScore + paceScore + historyScore;

                scores.push({
                    driverId: driverId,
                    fullName: safeRow.season_entries.drivers.full_name,
                    teamName: safeRow.season_entries.teams.name,
                    score: totalScore,
                    details: { gridScore, paceScore, historyScore }
                });
            } catch (e) {
                console.error("Skipping malformed row", e);
                continue;
            }
        }

        // 5. Determine Winner (Lowest Score)
        scores.sort((a, b) => a.score - b.score);
        const winner = scores[0];

        if (!winner) {
            throw new Error("Failed to calculate a winner from the available stats.");
        }

        // 6. Persist Prediction
        const { data: prediction, error: insertError } = await supabase
            .from('predictions')
            .insert({
                race_id: raceId,
                predicted_winner_id: winner.driverId,
                confidence_score: this.calculateConfidence(winner.score, scores[1]?.score),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) throw insertError;

        return prediction;
    }

    private calculateConfidence(winnerScore: number, runnerUpScore?: number): number {
        if (!runnerUpScore) return 1.0; 
        const gap = runnerUpScore - winnerScore;
        return Math.min(0.99, 0.5 + (gap / 10)); 
    }
}
