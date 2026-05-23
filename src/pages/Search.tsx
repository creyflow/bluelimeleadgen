import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { AdvancedQueryBuilder } from "@/components/AdvancedQueryBuilder";
import { ContactsTable } from "@/components/ContactsTable";

const Search = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEmbedded = window.self !== window.top;

  const handleSearch = async (searchParams: any) => {
    setIsSearching(true);
    setSearchResults([]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato");

      const { data, error } = await supabase.functions.invoke('search-contacts', {
        body: searchParams
      });

      if (error) throw error;

      if (data?.contacts) {
        setSearchResults(data.contacts);
        toast({
          title: "Ricerca completata",
          description: `Trovati ${data.contacts.length} contatti`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Errore durante la ricerca",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header (Hidden when embedded) */}
        {!isEmbedded && (
          <header className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-4">
              <img src={logo} alt="BluelimeLeads.com" className="h-14 w-auto" style={{ width: '44.8px' }} />
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-green-500 to-blue-500 bg-clip-text text-transparent">BluelimeLeads.com</h1>
                <p className="text-muted-foreground mt-1">Nuova Ricerca</p>
              </div>
            </div>
            <Button onClick={() => navigate('/dashboard')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla Dashboard
            </Button>
          </header>
        )}

        {/* Search Form - Full Width */}
        <div className="mb-8">
          <AdvancedQueryBuilder 
            onQueryGenerated={(query) => console.log('Query generata:', query)}
            onSearch={handleSearch}
          />
        </div>

        {/* Search Results */}
        {(searchResults.length > 0 || isSearching) && (
          <div className="mt-8">
            <ContactsTable 
              contacts={searchResults} 
              isLoading={isSearching}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
