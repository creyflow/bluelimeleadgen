import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Mail, Zap, LogOut, CheckCircle, BookOpen, User } from "lucide-react";
import logo from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { UsageStats } from "@/components/UsageStats";


const Dashboard = () => {
  const [contactsCount, setContactsCount] = useState(0);
  const [searchesCount, setSearchesCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Disconnesso",
      description: "Sei stato disconnesso con successo",
    });
    navigate('/auth');
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [contactsRes, searchesRes] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('searches').select('id', { count: 'exact', head: true })
      ]);

      setContactsCount(contactsRes.count || 0);
      setSearchesCount(searchesRes.count || 0);
    } catch (error: any) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header with Actions */}
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <img src={logo} alt="BluelimeLeads.com" className="h-14 w-auto" style={{ width: '44.8px' }} />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-green-500 to-blue-500 bg-clip-text text-transparent">BluelimeLeads.com</h1>
              <p className="text-muted-foreground mt-1">Dashboard centrale</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/profile')} variant="ghost" size="sm">
              <User className="mr-2 h-4 w-4" />
              Profilo
            </Button>
            <Button onClick={handleLogout} variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Esci
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {/* Quick Actions */}
            <div className="mb-12">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-secondary">→</span> Azioni Rapide
              </h2>
              <div className="grid gap-4 md:grid-cols-4">
                <Button 
                  onClick={() => navigate('/search')}
                  size="lg"
                  className="h-24 bg-primary hover:bg-primary/90 text-lg font-semibold"
                >
                  <Search className="mr-3 h-6 w-6" />
                  Nuova Ricerca
                </Button>
                <Button 
                  onClick={() => navigate('/batch')}
                  size="lg"
                  className="h-24 bg-secondary hover:bg-secondary/90 text-lg font-semibold"
                >
                  <Zap className="mr-3 h-6 w-6" />
                  Batch Manager
                </Button>
                <Button 
                  onClick={() => navigate('/guide')}
                  size="lg"
                  variant="outline"
                  className="h-24 text-lg font-semibold border-2"
                >
                  <BookOpen className="mr-3 h-6 w-6" />
                  Guida Utente
                </Button>
                <Button 
                  onClick={() => navigate('/validate')}
                  size="lg"
                  className="h-24 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-lg font-semibold relative overflow-hidden"
                >
                  <div className="absolute top-2 right-2">
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">∞ Unlimited</span>
                  </div>
                  <CheckCircle className="mr-3 h-6 w-6" />
                  Validazione Email
                </Button>
              </div>
            </div>

            {/* Usage Stats */}
            <div className="mb-8">
              <h2 
                className="text-xl font-semibold mb-4 flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                onClick={() => navigate('/pricing')}
              >
                <span className="text-primary">⚡</span> Il tuo Piano
              </h2>
              <UsageStats />
            </div>

            {/* Stats Cards */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-accent">📊</span> Statistiche
              </h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div 
                  onClick={() => navigate('/contacts')}
                  className="cursor-pointer transition-all hover:scale-105 hover:shadow-lg hover:shadow-primary/20"
                >
                  <Card className="border-2 border-border hover:border-primary">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-primary">
                        <Mail className="h-5 w-5" />
                        Contatti Salvati
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-5xl font-bold text-primary">{contactsCount}</div>
                      <p className="text-sm text-muted-foreground mt-2">Clicca per visualizzare tutti</p>
                    </CardContent>
                  </Card>
                </div>

                <div 
                  onClick={() => navigate('/searches')}
                  className="cursor-pointer transition-all hover:scale-105 hover:shadow-lg hover:shadow-secondary/20"
                >
                  <Card className="border-2 border-border hover:border-secondary">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-secondary">
                        <Search className="h-5 w-5" />
                        Ricerche Effettuate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-5xl font-bold text-secondary">{searchesCount}</div>
                      <p className="text-sm text-muted-foreground mt-2">Clicca per lo storico</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
