import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2 } from "lucide-react";

export function ProfileCharts() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const isoDate = sevenDaysAgo.toISOString();

      const [searches, validations] = await Promise.all([
        supabase
          .from('searches')
          .select('created_at')
          .eq('user_id', user.id)
          .gte('created_at', isoDate),
        supabase
          .from('validation_lists')
          .select('created_at')
          .eq('user_id', user.id)
          .gte('created_at', isoDate)
      ]);

      if (searches.error) throw searches.error;
      if (validations.error) throw validations.error;

      // Process data
      const stats = new Map();
      
      // Initialize last 7 days
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
        stats.set(dateStr, { name: dateStr, ricerche: 0, validazioni: 0 });
      }

      searches.data?.forEach((s: any) => {
        try {
            const dateStr = new Date(s.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            if (stats.has(dateStr)) {
            const curr = stats.get(dateStr);
            curr.ricerche++;
            stats.set(dateStr, curr);
            }
        } catch (e) { console.error("Date parse error", e)}
      });

      validations.data?.forEach((v: any) => {
        try {
            const dateStr = new Date(v.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
            if (stats.has(dateStr)) {
            const curr = stats.get(dateStr);
            curr.validazioni++;
            stats.set(dateStr, curr);
            }
        } catch (e) { console.error("Date parse error", e)}
      });

      // Convert to array and reverse to show chronological order
      const chartData = Array.from(stats.values()).reverse();
      setData(chartData);

    } catch (error: any) {
      console.error("Error loading stats:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
      return (
        <Card className="h-full">
            <CardContent className="flex items-center justify-center h-[300px] text-red-500">
                Errore caricamento grafici
            </CardContent>
        </Card>
      )
  }

  return (
    <Card className="h-full shadow-md hover:shadow-lg transition-shadow duration-300">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-primary">Attività Recente</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
              <XAxis 
                dataKey="name" 
                className="text-xs font-medium" 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                className="text-xs font-medium" 
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--popover))', 
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
                itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar 
                dataKey="ricerche" 
                name="Ricerche" 
                fill="#3b82f6" 
                radius={[4, 4, 0, 0]} 
                barSize={20}
              />
              <Bar 
                dataKey="validazioni" 
                name="Validazioni" 
                fill="#10b981" 
                radius={[4, 4, 0, 0]} 
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
