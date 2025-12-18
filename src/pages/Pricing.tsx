
import { useEffect, useState } from "react";
import { Check, Loader2, Zap, CreditCard, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  monthly_email_limit: number;
  validation_limit: number;
  monthly_search_limit?: number;
  speed_limit?: number;
  features: string[];
}

// Fallback data in case DB fetch fails
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly_price: 0,
    monthly_email_limit: 5000,
    validation_limit: 5000,
    monthly_search_limit: 100,
    speed_limit: 1,
    features: ["Validazione base", "Export CSV/XLSX"]
  },
  {
    id: 'basic',
    name: 'Basic',
    monthly_price: 9.9,
    monthly_email_limit: 10000,
    validation_limit: 10000,
    monthly_search_limit: 250,
    speed_limit: 1,
    features: ["Validazione avanzata", "Export CSV/XLSX/JSON", "Supporto prioritario"]
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly_price: 19.9,
    monthly_email_limit: 25000,
    validation_limit: 25000,
    monthly_search_limit: 500,
    speed_limit: 3,
    features: ["Validazione avanzata", "Tutti i formati export", "Accesso API", "Supporto prioritario"]
  },
  {
    id: 'elite',
    name: 'Elite',
    monthly_price: 29.9,
    monthly_email_limit: 100000,
    validation_limit: 100000,
    monthly_search_limit: 1000,
    speed_limit: 10,
    features: ["Validazione avanzata", "Tutti i formati export", "Accesso API", "Supporto dedicato", "Integrazione custom"]
  },
  {
    id: 'vip',
    name: 'VIP',
    monthly_price: 49.9,
    monthly_email_limit: 500000,
    validation_limit: 500000,
    monthly_search_limit: 50000,
    speed_limit: 10,
    features: ["Validazione avanzata", "Tutti i formati export", "Accesso API completo", "Supporto dedicato", "Integrazione custom"]
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    monthly_price: 99.9,
    monthly_email_limit: -1,
    validation_limit: -1,
    monthly_search_limit: -1,
    speed_limit: 10,
    features: ["Tutto illimitato", "Validazione avanzata", "Tutti i formati export", "Accesso API completo", "Supporto dedicato", "Integrazione custom"]
  }
];

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlans();
    fetchCurrentPlan();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('monthly_price', { ascending: true });

      if (error) {
        console.warn('Could not fetch plans from DB, using fallback:', error);
        setPlans(FALLBACK_PLANS);
      } else if (data && data.length > 0) {
        setPlans(data);
      } else {
        setPlans(FALLBACK_PLANS);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
      setPlans(FALLBACK_PLANS);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentPlan = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();

    if (data) {
      setCurrentPlanId(data.plan_id);
    }
  };

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/auth');
        return;
      }

      // In a real application, this would redirect to a payment processor (Stripe, etc.)
      // For this demo, we'll directly update the user's plan
      const { error } = await supabase
        .from('profiles')
        .update({ 
          plan_id: planId,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      setCurrentPlanId(planId);
      toast({
        title: "Successo!",
        description: "Il tuo piano è stato aggiornato con successo.",
      });
      
      setIsDialogOpen(false);
      // Refresh the page or state to reflect changes
      window.location.reload();
      
    } catch (error) {
      console.error('Error upgrading plan:', error);
      toast({
        title: "Upgrade Fallito",
        description: "Impossibile aggiornare il piano. Riprova più tardi.",
        variant: "destructive",
      });
    } finally {
      setUpgrading(null);
    }
  };

  const handlePromoCodeSubmit = () => {
    if (promoCode.toLowerCase() === "bluelime") {
      if (selectedPlan) {
        // Il codice vale solo fino al piano Elite
        const allowedPlans = ['free', 'basic', 'pro', 'elite'];
        if (allowedPlans.includes(selectedPlan.id)) {
          handleUpgrade(selectedPlan.id);
        } else {
          toast({
            title: "Codice non valido per questo piano",
            description: "Il codice promozionale è valido solo per piani fino a Elite.",
            variant: "destructive",
          });
        }
      }
    } else {
      toast({
        title: "Codice non valido",
        description: "Il codice promozionale inserito non è valido.",
        variant: "destructive",
      });
    }
  };

  const openUpgradeModal = (plan: Plan) => {
    setSelectedPlan(plan);
    setPromoCode("");
    setIsDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <Button 
        variant="ghost" 
        onClick={() => navigate("/validate")} 
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Torna alla Validazione
      </Button>

      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Prezzi Semplici e Trasparenti</h1>
        <p className="text-xl text-muted-foreground">
          Scegli il piano più adatto alle tue esigenze. Fai upgrade o downgrade in qualsiasi momento.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlanId === plan.id;
          const isFree = plan.monthly_price === 0;

          return (
            <Card key={plan.id} className={`flex flex-col ${isCurrentPlan ? 'border-primary shadow-lg scale-105' : ''}`}>
              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-3xl font-bold text-foreground">
                    {isFree ? 'Gratis' : `€${plan.monthly_price}`}
                  </span>
                  {!isFree && <span className="text-muted-foreground">/mese</span>}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  <li className="flex items-center">
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    <span className="text-sm">
                      {plan.monthly_search_limit === -1 
                        ? "Ricerche illimitate" 
                        : `${plan.monthly_search_limit?.toLocaleString() || 0} ricerche/mese`}
                    </span>
                  </li>
                  <li className="flex items-center">
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    <span className="text-sm">
                      {plan.validation_limit === -1 
                        ? "Validazioni email illimitate" 
                        : `Fino a ${plan.validation_limit.toLocaleString()} validazioni email/mese`}
                    </span>
                  </li>
                  {plan.speed_limit && (
                    <li className="flex items-center">
                      <Zap className="h-4 w-4 mr-2 text-yellow-500" />
                      <span className="text-sm">
                        Velocità: {plan.speed_limit} email/sec
                      </span>
                    </li>
                  )}
                  {/* Parse features if they are stored as JSON string or array */}
                  {(typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features).map((feature: string, i: number) => (
                    <li key={i} className="flex items-center">
                      <Check className="h-4 w-4 mr-2 text-green-500" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={isCurrentPlan ? "outline" : "default"}
                  disabled={isCurrentPlan || upgrading === plan.id}
                  onClick={() => openUpgradeModal(plan)}
                >
                  {upgrading === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isCurrentPlan ? "Piano Attuale" : "Passa a questo piano"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Attiva Piano {selectedPlan?.name}</DialogTitle>
            <DialogDescription>
              Scegli il metodo di pagamento per attivare il piano {selectedPlan?.name}.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="code" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="code">Codice Promo</TabsTrigger>
              <TabsTrigger value="card">Carta di Credito</TabsTrigger>
            </TabsList>
            
            <TabsContent value="code" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="promo">Inserisci Codice</Label>
                <div className="flex gap-2">
                  <Input 
                    id="promo" 
                    placeholder="Es. BLUELIME" 
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                  />
                  <Button onClick={handlePromoCodeSubmit} disabled={upgrading === selectedPlan?.id}>
                    {upgrading === selectedPlan?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Inserisci il codice "bluelime" per attivare piani fino a Elite gratuitamente (modalità test).
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="card" className="space-y-4 py-4">
              <div className="p-4 border rounded-lg bg-muted/50 text-center space-y-3">
                <CreditCard className="h-10 w-10 mx-auto text-muted-foreground" />
                <h3 className="font-semibold">Pagamenti Stripe</h3>
                <p className="text-sm text-muted-foreground">
                  L'integrazione con Stripe sarà disponibile a breve. Per ora, utilizza un codice promozionale.
                </p>
                <Button disabled className="w-full">
                  Paga con Carta (Presto disponibile)
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
