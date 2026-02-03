import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Trophy, Target } from "lucide-react";

interface RaceCardProps {
  race: any; 
}

export const RaceCard = ({ race }: RaceCardProps) => {
  const isPast = race.status === 'completed';
  const prediction = Array.isArray(race.predictions) ? race.predictions[0] : race.predictions;
  const predictedDriver = prediction?.predicted_winner;
  const actualDriver = prediction?.actual_winner;

  const isCorrect = isPast && predictedDriver?.id && actualDriver?.id && predictedDriver.id === actualDriver.id;

  return (
    <Card className={cn(
      "transition-all duration-300 hover:shadow-md",
      isCorrect ? "border-green-500/50 bg-green-500/5" : "hover:border-primary/50"
    )}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold leading-tight">
            {race.race_name}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {new Date(race.race_date).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
          </p>
        </div>
        <Badge variant={isPast ? "secondary" : "outline"} className={cn(
          "ml-2 shrink-0 capitalize",
          race.status === 'upcoming' && "bg-primary/10 text-primary border-primary/20"
        )}>
          {race.status.replace('_', ' ')}
        </Badge>
      </CardHeader>
      
      <CardContent className="pt-4">
        <div className="space-y-4">
          {/* Prediction Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <Target className="h-3 w-3" />
              <span>Prediction</span>
            </div>
            {predictedDriver ? (
              <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
                <div className="flex items-center gap-3">
                  <div 
                    className="h-8 w-1 shrink-0 rounded-full" 
                    style={{ backgroundColor: predictedDriver.team_colour || '#333' }}
                  />
                  <div>
                    <p className="text-sm font-bold leading-none">{predictedDriver.full_name}</p>
                    <p className="text-xs text-muted-foreground">{predictedDriver.team_name}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                Pending Analysis
              </div>
            )}
          </div>

          {/* Actual Result Section (only if past) */}
          {isPast && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Trophy className="h-3 w-3" />
                <span>Winner</span>
              </div>
              {actualDriver ? (
                <div className={cn(
                  "flex items-center justify-between rounded-md p-2",
                  isCorrect ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-muted/50"
                )}>
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-8 w-1 shrink-0 rounded-full" 
                      style={{ backgroundColor: actualDriver.team_colour || '#333' }}
                    />
                    <div>
                      <p className="text-sm font-bold leading-none">{actualDriver.full_name}</p>
                      <p className="text-xs opacity-80">{actualDriver.team_name}</p>
                    </div>
                  </div>
                  {isCorrect && (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">Correct</Badge>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                  Awaiting Results
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};