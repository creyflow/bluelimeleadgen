import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Mail, CheckCircle } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  monthly_email_limit: number;
  validation_limit: number;
}

interface Usage {
  emails_found_count: number;
  validations_performed_count: number;
  period_end: string;
}

interface Profile {
  plan_id: string;
}

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function UsageStats() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsageData();
  }, []);

  const loadUsageData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get profile to know the plan
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_id')
        .eq('id', user.id)
        .single();

      if (profile) {
        // Get plan details
        const { data: planData } = await supabase
          .from('plans')
          .select('*')
          .eq('id', profile.plan_id)
          .single();
        
        setPlan(planData);
      }

      // Get current usage
      // We need to find the active usage record. 
      // Since we don't have a simple "get current" RPC, we query by date
      const now = new Date().toISOString();
      const { data: usageData, error: usageError } = await supabase
        .from('usage_records')
        .select('*')
        .eq('user_id', user.id)
        .lte('period_start', now)
        .gte('period_end', now)
        .order('period_start', { ascending: false })  // Most recent first
        .limit(1)                                      // Only one result
        .maybeSingle();  // Returns null if no data, doesn't throw 406

      if (usageError) {
        console.error('Error fetching current usage:', usageError);
      }

      if (usageData) {
        setUsage(usageData);
      } else {
        // Fallback if no record found (e.g. new user before trigger ran or edge case)
        // Try to fetch the latest record
        const { data: latestUsage, error: latestError } = await supabase
          .from('usage_records')
          .select('*')
          .eq('user_id', user.id)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (latestError) {
          console.error('Error fetching latest usage:', latestError);
        }
          
        if (latestUsage) setUsage(latestUsage);
      }

    } catch (error) {
      console.error("Error loading usage data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!plan || !usage) return null;

  const emailLimit = plan.monthly_email_limit === -1 ? Infinity : plan.monthly_email_limit;
  const validationLimit = plan.validation_limit === -1 ? Infinity : plan.validation_limit;
  
  const emailPercent = emailLimit === Infinity ? 0 : Math.min(100, (usage.emails_found_count / emailLimit) * 100);
  const validationPercent = validationLimit === Infinity ? 0 : Math.min(100, (usage.validations_performed_count / validationLimit) * 100);

  const daysLeft = Math.max(0, Math.ceil((new Date(usage.period_end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle 
            className="text-lg font-medium cursor-pointer hover:underline"
            onClick={() => navigate('/pricing')}
          >
            Il tuo Piano: <span className="text-primary font-bold">{plan.name}</span>
          </CardTitle>
          <Badge variant="outline" className="ml-2">
            Reset tra {daysLeft} giorni
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>Email Trovate</span>
            </div>
            <span className="font-medium">
              {usage.emails_found_count.toLocaleString()} / {emailLimit === Infinity ? "Illimitate" : emailLimit.toLocaleString()}
            </span>
          </div>
          <Progress value={emailPercent} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span>Validazioni</span>
            </div>
            <span className="font-medium">
              {usage.validations_performed_count.toLocaleString()} / {validationLimit === Infinity ? "Illimitate" : validationLimit.toLocaleString()}
            </span>
          </div>
          <Progress value={validationPercent} className="h-2" />
        </div>
        
        <div className="pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full gap-2"
            onClick={() => navigate('/pricing')}
          >
            <Zap className="h-3 w-3" />
            {plan.id === 'unlimited' ? 'Gestisci Piano' : 'Upgrade Piano'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
