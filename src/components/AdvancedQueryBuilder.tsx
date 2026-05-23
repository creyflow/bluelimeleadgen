import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Search, Save, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SearchParams {
  query: string;
  location?: string;
  emailProviders: string[];
  websites: string[];
  targetNames: string[];
  pages: number;
}

interface QueryTemplate {
  id: string;
  name: string;
  query_pattern: string;
  default_pages: number;
  created_at: string;
  user_id: string;
}

interface AdvancedQueryBuilderProps {
  onQueryGenerated: (query: string) => void;
  onSearch: (searchParams: SearchParams) => void;
}

export const AdvancedQueryBuilder = ({ onQueryGenerated, onSearch }: AdvancedQueryBuilderProps) => {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [emailProviders, setEmailProviders] = useState<string[]>([]);
  const [currentProvider, setCurrentProvider] = useState("");
  const [searchEngines, setSearchEngines] = useState<string[]>([]);
  const [currentEngine, setCurrentEngine] = useState("");
  const [websites, setWebsites] = useState<string[]>([]);
  const [currentWebsite, setCurrentWebsite] = useState("");
  const [targetNames, setTargetNames] = useState<string[]>([]);
  const [currentName, setCurrentName] = useState("");
  const [generatedQuery, setGeneratedQuery] = useState("");
  const [pages, setPages] = useState(10);
  const [templateName, setTemplateName] = useState("");
  const [templates, setTemplates] = useState<QueryTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('query_templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setTemplates(data);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Nome richiesto",
        description: "Inserisci un nome per salvare il template",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('query_templates')
      .insert({
        name: templateName,
        query_pattern: JSON.stringify({
          keyword,
          location,
          emailProviders,
          searchEngines,
          websites,
          targetNames,
        }),
        default_pages: pages,
        user_id: user?.id,
      });

    if (error) {
      toast({
        title: "Errore",
        description: "Impossibile salvare il template",
        variant: "destructive",
      });
    } else {
      toast({
        title: "✓ Template salvato",
        description: `"${templateName}" salvato con successo`,
      });
      // Non azzero più il nome così rimane visibile dopo il salvataggio
      loadTemplates();
    }
  };

  const loadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const pattern = JSON.parse(template.query_pattern);
      setKeyword(pattern.keyword || "");
      setLocation(pattern.location || "");
      setEmailProviders(pattern.emailProviders || []);
      setSearchEngines(pattern.searchEngines || []);
      setWebsites(pattern.websites || []);
      setTargetNames(pattern.targetNames || []);
      setPages(template.default_pages || 10);
      setGeneratedQuery("");
      toast({
        title: "✓ Template caricato",
        description: `"${template.name}" caricato con successo`,
      });
    }
  };

  const addEmailProvider = () => {
    if (currentProvider && !emailProviders.includes(currentProvider)) {
      setEmailProviders([...emailProviders, currentProvider]);
      setCurrentProvider("");
    }
  };

  const removeEmailProvider = (provider: string) => {
    setEmailProviders(emailProviders.filter(p => p !== provider));
  };

  const addSearchEngine = () => {
    if (currentEngine && !searchEngines.includes(currentEngine)) {
      setSearchEngines([...searchEngines, currentEngine]);
      setCurrentEngine("");
    }
  };

  const removeSearchEngine = (engine: string) => {
    setSearchEngines(searchEngines.filter(e => e !== engine));
  };

  const normalizeWebsite = (url: string): string => {
    let normalized = url.trim().toLowerCase();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/^www\./, '');
    
    // Forziamo le ricerche LinkedIn sui profili personali (/in)
    if (normalized.includes('linkedin.com') || normalized === 'linkedin') {
      return 'linkedin.com/in';
    }

    normalized = normalized.split('/')[0];
    if (!normalized.includes('.')) {
      normalized += '.com';
    }
    return normalized;
  };

  const addWebsite = () => {
    if (currentWebsite) {
      const normalized = normalizeWebsite(currentWebsite);
      if (!websites.includes(normalized)) {
        setWebsites([...websites, normalized]);
        setCurrentWebsite("");
      }
    }
  };

  const removeWebsite = (website: string) => {
    setWebsites(websites.filter(w => w !== website));
  };

  const addTargetName = () => {
    if (currentName && !targetNames.includes(currentName)) {
      setTargetNames([...targetNames, currentName]);
      setCurrentName("");
    }
  };

  const removeTargetName = (name: string) => {
    setTargetNames(targetNames.filter(n => n !== name));
  };

  // Helper: default email providers when searching social without providers
  const SOCIAL_DOMAINS = ['instagram.com','facebook.com','linkedin.com','tiktok.com'];
  const getEffectiveEmailProviders = (current: string[], sites: string[]) => {
    const hasSocial = sites?.some((w) => SOCIAL_DOMAINS.includes(w.toLowerCase()));
    return hasSocial && (!current || current.length === 0) ? ['@gmail.com','@yahoo.com'] : current;
  };

  const generateQuery = () => {
    // Build REAL search query for Google including all filters
    const searchQueryParts: string[] = [];

    if (keyword) searchQueryParts.push(keyword);
    if (location) searchQueryParts.push(`"${location}"`);
    
    // site: filters
    if (websites.length > 0) {
      const sitePart = websites.map(w => `site:${w}`).join(" OR ");
      searchQueryParts.push(`(${sitePart})`);
    }

    const effectiveProvidersGen = getEffectiveEmailProviders(emailProviders, websites);
    if (effectiveProvidersGen.length > 0) {
      const providerTerms = Array.from(new Set(
        effectiveProvidersGen.flatMap((raw) => {
          const p = raw.trim();
          if (!p) return [] as string[];
          const terms: string[] = [];
          terms.push(`"${p}"`);
          const noAt = p.replace('@', '');
          if (!p.includes('.')) terms.push(`"${noAt}.com"`);
          return terms;
        })
      ));
      if (providerTerms.length > 0) searchQueryParts.push(`(${providerTerms.join(' OR ')})`);
      if (emailProviders.length === 0 && effectiveProvidersGen.length > 0) {
        toast({
          title: "Suggerimento aggiunto",
          description: 'Aggiunti automaticamente "@gmail.com" e "@yahoo.com" per trovare email sui social.',
        });
      }
    }

    // target names
    if (targetNames.length > 0) {
      const namesPart = targetNames.map(n => `"${n}"`).join(' OR ');
      searchQueryParts.push(`(${namesPart})`);
    }
    
    const realQuery = searchQueryParts.join(' ');
    setGeneratedQuery(realQuery);
    onQueryGenerated(realQuery);
  };

  const executeSearch = () => {
    if (!keyword) {
      return;
    }
    
    // Generate query if not already generated
    let queryToSend = generatedQuery;
    if (!queryToSend) {
      generateQuery();
      // Wait for state update, use current values to build query
      const parts: string[] = [];
      if (keyword) parts.push(keyword);
      if (location) parts.push(`"${location}"`);
      if (websites.length > 0) {
        const sitePart = websites.map(w => `site:${w}`).join(" OR ");
        parts.push(`(${sitePart})`);
      }
      const effectiveProvidersExec = getEffectiveEmailProviders(emailProviders, websites);
      if (effectiveProvidersExec.length > 0) {
        const providerTerms = Array.from(new Set(
          effectiveProvidersExec.flatMap((raw) => {
            const p = raw.trim();
            if (!p) return [] as string[];
            const terms: string[] = [];
            terms.push(`"${p}"`);
            const noAt = p.replace('@', '');
            if (!p.includes('.')) terms.push(`"${noAt}.com"`);
            return terms;
          })
        ));
        if (providerTerms.length > 0) parts.push(`(${providerTerms.join(' OR ')})`);
      }
      if (targetNames.length > 0) {
        const namesPart = targetNames.map(n => `"${n}"`).join(' OR ');
        parts.push(`(${namesPart})`);
      }
      queryToSend = parts.join(' ');
    }
    
    console.log('Sending query to backend:', queryToSend);
    
    // Pass the FULL query to backend
    const effectiveProvidersFinal = getEffectiveEmailProviders(emailProviders, websites);
    const searchParams = {
      query: queryToSend,
      location: location || undefined,
      emailProviders: effectiveProvidersFinal,
      websites,
      targetNames,
      pages
    };

    onSearch(searchParams);
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-accent/10">
        <CardTitle className="text-2xl flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Crea Nuova Ricerca
        </CardTitle>
        <CardDescription className="text-base">
          Compila i campi per avviare una ricerca di contatti
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* Template Section */}
        <div className="space-y-4 p-4 bg-primary/5 border-2 border-primary/20 rounded-lg">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            <Label className="text-lg font-semibold">Template Salvati</Label>
          </div>
          
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>Carica un template</Label>
              <Select value={selectedTemplate} onValueChange={(value) => {
                setSelectedTemplate(value);
                loadTemplate(value);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} ({template.default_pages} pagine)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Salva template corrente</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Nome del template..."
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <Button onClick={saveTemplate} variant="outline" size="icon">
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="keyword">1. Parola chiave o frase</Label>
          <Input
            id="keyword"
            placeholder='es: "web developer" OR "software engineer"'
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">2. Città o luogo</Label>
          <Input
            id="location"
            placeholder="es: Milano, Italia"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>3. Provider email</Label>
          <div className="flex gap-2">
            <Input
              placeholder="es: @gmail.com"
              value={currentProvider}
              onChange={(e) => setCurrentProvider(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addEmailProvider()}
            />
            <Button type="button" onClick={addEmailProvider} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {emailProviders.map(provider => (
              <Badge key={provider} variant="secondary" className="gap-1">
                {provider}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeEmailProvider(provider)}
                />
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>4. Motori di ricerca</Label>
          <div className="flex gap-2">
            <Input
              placeholder="es: google, bing"
              value={currentEngine}
              onChange={(e) => setCurrentEngine(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addSearchEngine()}
            />
            <Button type="button" onClick={addSearchEngine} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {searchEngines.map(engine => (
              <Badge key={engine} variant="secondary" className="gap-1">
                {engine}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeSearchEngine(engine)}
                />
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>5. Siti web da cui estrarre</Label>
          <div className="flex gap-2">
            <Input
              placeholder="es: linkedin.com"
              value={currentWebsite}
              onChange={(e) => setCurrentWebsite(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addWebsite()}
            />
            <Button type="button" onClick={addWebsite} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {websites.map(website => (
              <Badge key={website} variant="secondary" className="gap-1">
                {website}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeWebsite(website)}
                />
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>6. Nomi da cercare (opzionale)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="es: Maria, Anna, Vittoria, Elena"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTargetName()}
            />
            <Button type="button" onClick={addTargetName} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Filtra solo i contatti con questi nomi. Lascia vuoto per non filtrare.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {targetNames.map(name => (
              <Badge key={name} variant="secondary" className="gap-1">
                {name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => removeTargetName(name)}
                />
              </Badge>
            ))}
          </div>
        </div>

        <Button
          onClick={generateQuery} 
          className="w-full bg-primary hover:bg-primary/90" 
          size="lg"
        >
          <Search className="mr-2 h-5 w-5" />
          Genera Query
        </Button>

        {generatedQuery && (
          <div className="space-y-4 p-4 bg-secondary/10 border-2 border-secondary rounded-lg">
            <div className="space-y-2">
              <Label className="text-secondary font-semibold">✓ Query generata con successo</Label>
              <Textarea
                value={generatedQuery}
                readOnly
                className="font-mono text-sm bg-background"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pages" className="text-foreground">
                Numero di pagine da analizzare
              </Label>
              <Input
                id="pages"
                type="number"
                min="1"
                max="50"
                value={pages}
                onChange={(e) => setPages(Math.min(50, parseInt(e.target.value) || 10))}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Ogni pagina = ~10 risultati. Max 50 pagine (500 risultati). Più pagine = più contatti ma più tempo.
              </p>
            </div>

            <Button 
              onClick={executeSearch}
              className="w-full bg-secondary hover:bg-secondary/90 text-lg font-semibold" 
              size="lg"
            >
              <Search className="mr-2 h-6 w-6" />
              🚀 Avvia Ricerca ({pages} {pages === 1 ? 'pagina' : 'pagine'})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
