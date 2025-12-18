import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Play, Pause, Trash2, Download, Plus, FileDown, Eye } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface Batch {
  id: string;
  name: string;
  description: string | null;
  status: string;
  total_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  delay_seconds: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Job {
  query: string;
  location: string | null;
  pages: number;
  target_names: string[] | null;
  country: string;
}

export default function BatchManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  
  // Form state
  const [batchName, setBatchName] = useState("");
  const [batchDescription, setBatchDescription] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(120);
  const [csvContent, setCsvContent] = useState("");

  useEffect(() => {
    loadBatches();
    
    // NO auto-refresh! Ricaricare solo manualmente per ridurre le query
    // Se serve vedere gli aggiornamenti in tempo reale, l'utente usa il bottone Ricarica
  }, []);

  const loadBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('search_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBatches(data || []);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      // Import XLSX dynamically
      const XLSX = await import('xlsx');
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const csvText = XLSX.utils.sheet_to_csv(firstSheet);
        setCsvContent(csvText);
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV file
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvContent(text);
      };
      reader.readAsText(file);
    }
  };

  const createBatch = async () => {
    if (!batchName.trim()) {
      toast({
        title: "Errore",
        description: "Inserisci il nome del batch",
        variant: "destructive",
      });
      return;
    }

    try {
      let jobs: Job[] = [];
      
      // Parsing CSV solo se presente - supporta virgolette per campi con virgole
      if (csvContent.trim()) {
        const normalized = csvContent.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const linesArr = normalized.split('\n').filter(l => l.trim());
        const header = linesArr[0] || '';
        const sample = linesArr[1] || header;

        const detectDelimiter = (s: string) => {
          const candidates = [',', ';', '\t'];
          const counts = candidates.map(d => (s.match(new RegExp(`\\${d}`, 'g')) || []).length);
          const max = Math.max(...counts);
          return max > 0 ? candidates[counts.indexOf(max)] : ',';
        };

        const delimiter = detectDelimiter(sample);

        const parseLine = (line: string, delim: string) => {
          const out: string[] = [];
          let cur = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
              else { inQuotes = !inQuotes; }
            } else if (ch === delim && !inQuotes) {
              out.push(cur.trim());
              cur = '';
            } else {
              cur += ch;
            }
          }
          out.push(cur.trim());
          return out.map((t) => t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t);
        };

        // Costruisci i job gestendo anche il caso in cui il country sia su una riga separata
        const rows: Job[] = [];
        for (const line of linesArr.slice(1)) {
          const parts = parseLine(line, delimiter).map(p => p.trim());

          // Linee che contengono solo il country (es. "it" o ",it"): assegnale alla riga precedente
          if (parts.length === 1 && parts[0]) {
            const maybeCountry = parts[0].replace(/^,/, '').toLowerCase();
            if (/^[a-z]{2}$/.test(maybeCountry) && rows.length > 0) {
              rows[rows.length - 1].country = maybeCountry;
              continue;
            }
          }

          let query = parts[0] || '';
          let location = parts[1] ? parts[1] : null;
          const pagesParsed = Number.parseInt(parts[2] || '');
          const targetNamesStr = parts[3] || '';
          let country = (parts[4] || '').trim();

          // Se la location è vuota ma la query contiene un separatore (tab/;) con città alla fine, recuperala
          if (!location && /\t|;/.test(query)) {
            const split = query.split(/\t|;/);
            if (split.length > 1) {
              query = split[0].trim();
              const possibleLoc = split.slice(1).join(' ').trim();
              if (possibleLoc) location = possibleLoc;
            }
          }

          // Se la riga è solo una country (es. ",it") non creare un job
          if (/^,?([a-z]{2})$/i.test(query) && !parts[1] && !parts[2] && !parts[3]) {
            const code = query.replace(/^,/, '').toLowerCase();
            if (rows.length > 0) rows[rows.length - 1].country = code;
            continue;
          }

          const job: Job = {
            query,
            location: location && location.length > 0 ? location : null,
            pages: Number.isFinite(pagesParsed) ? pagesParsed : 10,
            target_names: targetNamesStr ? targetNamesStr.split('|').map(n => n.trim()).filter(Boolean) : null,
            country: country || 'it',
          };

          rows.push(job);
        }

        jobs = rows.filter(j => j.query && j.query.length > 0);
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Crea il batch
      const { data: batch, error: batchError } = await supabase
        .from('search_batches')
        .insert({
          name: batchName,
          description: batchDescription,
          total_jobs: jobs.length,
          delay_seconds: delaySeconds,
          user_id: user.id,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Crea i job solo se ce ne sono
      if (jobs.length > 0) {
        const jobsToInsert = jobs.map(job => ({
          batch_id: batch.id,
          user_id: user.id,
          ...job,
        }));

        const { error: jobsError } = await supabase
          .from('search_jobs')
          .insert(jobsToInsert);

        if (jobsError) throw jobsError;
      }

      toast({
        title: "Successo",
        description: jobs.length > 0 
          ? `Batch "${batchName}" creato con ${jobs.length} ricerche`
          : `Batch "${batchName}" creato (vuoto)`,
      });

      // Reset form
      setBatchName("");
      setBatchDescription("");
      setCsvContent("");
      setShowCreateForm(false);
      loadBatches();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const startBatch = async (batchId: string) => {
    try {
      await supabase
        .from('search_batches')
        .update({ 
          status: 'running',
          started_at: new Date().toISOString()
        })
        .eq('id', batchId);

      toast({
        title: "Batch avviato",
        description: "Il processamento automatico è iniziato",
      });

      loadBatches();

      // Trigger immediate processing
      await supabase.functions.invoke('process-search-queue');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const pauseBatch = async (batchId: string) => {
    try {
      await supabase
        .from('search_batches')
        .update({ status: 'paused' })
        .eq('id', batchId);

      toast({
        title: "Batch in pausa",
        description: "Il processamento è stato messo in pausa",
      });

      loadBatches();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const deleteBatch = async (batchId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo batch?")) return;

    try {
      await supabase
        .from('search_batches')
        .delete()
        .eq('id', batchId);

      toast({
        title: "Batch eliminato",
      });

      loadBatches();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const downloadTemplate = async (format: 'csv' | 'xlsx' = 'xlsx') => {
    const data = [
      ['query', 'location', 'pages', 'target_names'],
      ['marketing agentur (site:linkedin.com) ("@gmail.com")', 'Berlin', '10', ''],
      ['werbeagentur (site:facebook.com) ("@gmail.com")', 'München', '10', 'maria|sara|laura'],
      ['digital marketing', 'Hamburg', '10', ''],
    ];

    if (format === 'xlsx') {
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Batch');
      XLSX.writeFile(workbook, 'batch_template.xlsx');
    } else {
      const template = `query,location,pages,target_names
"marketing agentur (site:linkedin.com) (""@gmail.com"")",Berlin,10,""
"werbeagentur (site:facebook.com) (""@gmail.com"")",München,10,"maria|sara|laura"
"digital marketing",Hamburg,10,""`;
      
      const blob = new Blob([template], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'batch_template.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const exportBatchJobs = async (batchId: string, batchName: string) => {
    try {
      const { data: jobs, error } = await supabase
        .from('search_jobs')
        .select('query, location, pages')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!jobs || jobs.length === 0) {
        toast({
          title: "Nessun job",
          description: "Questo batch non contiene ricerche da esportare",
          variant: "destructive",
        });
        return;
      }

      // Crea CSV con virgolette per proteggere le virgole
      const csvHeader = 'query,location,pages\n';
      const csvRows = jobs.map(job => {
        const query = `"${(job.query || '').replace(/"/g, '""')}"`;
        const location = job.location || '';
        const pages = job.pages || 10;
        return `${query},${location},${pages}`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${batchName.replace(/[^a-z0-9]/gi, '_')}_batch.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "✓ Export completato",
        description: `${jobs.length} ricerche esportate`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      running: "default",
      completed: "outline",
      paused: "secondary",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status.toUpperCase()}</Badge>;
  };

  const getProgress = (batch: Batch) => {
    if (batch.total_jobs === 0) return 0;
    return Math.round((batch.completed_jobs / batch.total_jobs) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-4xl font-bold">Gestione Code Automatiche</h1>
            <p className="text-muted-foreground mt-2">
              Crea e gestisci batch di ricerche automatizzate
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Batch
          </Button>
        </div>

        {showCreateForm && (
          <Card className="border-2 border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-primary">→</span> Crea Nuovo Batch
              </CardTitle>
              <CardDescription>
                Inserisci un nome per il batch. Puoi caricare un CSV con le ricerche o aggiungerle dopo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step 1: Nome e Configurazione */}
              <div className="space-y-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  1️⃣ Configurazione Base
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="batchName" className="text-foreground">
                      Nome Batch <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="batchName"
                      placeholder="Es: Agenzie Marketing Germania"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      className={!batchName.trim() ? "border-destructive/50" : "border-primary/50"}
                      disabled={false}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delay" className="text-foreground">Delay tra ricerche (secondi)</Label>
                    <Input
                      id="delay"
                      type="number"
                      value={delaySeconds}
                      onChange={(e) => setDelaySeconds(parseInt(e.target.value) || 120)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-foreground">Descrizione (opzionale)</Label>
                  <Textarea
                    id="description"
                    placeholder="Descrivi l'obiettivo di questo batch..."
                    value={batchDescription}
                    onChange={(e) => setBatchDescription(e.target.value)}
                  />
                </div>
              </div>

              {/* Step 2: CSV Upload */}
              <div className="space-y-4 p-4 rounded-lg bg-secondary/5 border border-secondary/20">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-secondary flex items-center gap-2">
                    2️⃣ Carica File Excel/CSV <span className="text-muted-foreground text-sm">(opzionale)</span>
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadTemplate('xlsx')}>
                      <Download className="mr-2 h-4 w-4" />
                      Template Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadTemplate('csv')}>
                      <Download className="mr-2 h-4 w-4" />
                      Template CSV
                    </Button>
                  </div>
                </div>
                
                <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  csvContent ? 'border-secondary bg-secondary/10' : 'border-border'
                }`}>
                  <Upload className={`mx-auto h-12 w-12 mb-4 ${csvContent ? 'text-secondary' : 'text-muted-foreground'}`} />
                  <Label htmlFor="csvFile" className="cursor-pointer">
                    <span className="text-primary hover:underline font-medium">
                      {csvContent ? '✓ File Caricato - Clicca per sostituire' : 'Clicca per caricare CSV'}
                    </span>
                    <Input
                      id="csvFile"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </Label>
                  {csvContent && (
                    <div className="mt-3 text-sm space-y-1">
                      <p className="text-secondary font-semibold">
                        ✓ {csvContent.split('\n').length - 1} ricerche caricate
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Formato: query, location, pages
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button 
                  onClick={createBatch} 
                  className="flex-1 bg-primary hover:bg-primary/90"
                  disabled={!batchName.trim()}
                >
                  {!batchName.trim() ? 
                    '⚠️ Inserisci il nome del batch' : 
                    csvContent.trim() ? '✓ Crea Batch con CSV' : '✓ Crea Batch Vuoto'
                  }
                </Button>
                <Button variant="outline" onClick={() => {
                  setShowCreateForm(false);
                  setBatchName("");
                  setBatchDescription("");
                  setCsvContent("");
                }}>
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Batch Attivi</CardTitle>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nessun batch creato. Crea il tuo primo batch per iniziare!
              </p>
            ) : (
              <div className="space-y-4">
                {batches.map((batch) => (
                  <Card key={batch.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{batch.name}</CardTitle>
                          {batch.description && (
                            <CardDescription>{batch.description}</CardDescription>
                          )}
                        </div>
                        {getStatusBadge(batch.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progresso</span>
                          <span className="font-medium">
                            {batch.completed_jobs} / {batch.total_jobs} completati
                            {batch.failed_jobs > 0 && ` (${batch.failed_jobs} falliti)`}
                          </span>
                        </div>
                        <Progress value={getProgress(batch)} />
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          onClick={() => navigate(`/batch/${batch.id}`)}
                          size="sm"
                          variant="default"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Vedi Dettagli
                        </Button>

                        {batch.status === 'pending' || batch.status === 'paused' ? (
                          <Button onClick={() => startBatch(batch.id)} size="sm">
                            <Play className="mr-2 h-4 w-4" />
                            Avvia
                          </Button>
                        ) : null}
                        
                        {batch.status === 'running' && (
                          <Button onClick={() => pauseBatch(batch.id)} size="sm" variant="outline">
                            <Pause className="mr-2 h-4 w-4" />
                            Pausa
                          </Button>
                        )}

                        <Button 
                          onClick={() => exportBatchJobs(batch.id, batch.name)}
                          size="sm" 
                          variant="outline"
                        >
                          <FileDown className="mr-2 h-4 w-4" />
                          Esporta CSV
                        </Button>

                        <Button 
                          onClick={() => deleteBatch(batch.id)} 
                          size="sm" 
                          variant="destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Elimina
                        </Button>

                        <div className="ml-auto text-sm text-muted-foreground">
                          Delay: {batch.delay_seconds}s tra ricerche
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
