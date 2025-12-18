import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Download, RefreshCw, Mail, Phone, Building2, Globe } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import * as XLSX from 'xlsx';

interface BatchDetails {
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
  id: string;
  query: string;
  location: string | null;
  pages: number;
  status: string;
  result_count: number;
  executed_at: string | null;
  search_id: string | null;
  actual_contact_count?: number; // Conteggio reale dal database
}

interface Contact {
  id: string;
  name: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  created_at: string;
}

export default function BatchDetails() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [batch, setBatch] = useState<BatchDetails | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!batchId) return;
    
    loadBatchData();
    
    // Auto-refresh SOLO se il batch è in elaborazione
    // Se è completato, disabilita il refresh per risparmiare query
    if (batch?.status === 'running') {
      const interval = setInterval(loadBatchData, 30000);
      return () => clearInterval(interval);
    }
  }, [batchId, batch?.status]);

  const loadBatchData = async () => {
    try {
      // Load batch info
      const { data: batchData, error: batchError } = await supabase
        .from('search_batches')
        .select('*')
        .eq('id', batchId)
        .single();

      if (batchError) throw batchError;
      setBatch(batchData);

      // Load jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('search_jobs')
        .select('*')
        .eq('batch_id', batchId)
        .order('created_at', { ascending: true });

      if (jobsError) throw jobsError;

      // Load all contacts from completed jobs
      const completedSearchIds = (jobsData || [])
        .filter(j => j.search_id)
        .map(j => j.search_id);

      if (completedSearchIds.length > 0) {
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .in('search_id', completedSearchIds)
          .order('created_at', { ascending: false });

        if (contactsError) throw contactsError;
        setContacts(contactsData || []);

        // Conta i contatti reali per ogni job
        const contactCountsBySearchId = (contactsData || []).reduce((acc, contact) => {
          if (contact.search_id) {
            acc[contact.search_id] = (acc[contact.search_id] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);

        // Aggiorna i job con il conteggio reale
        const jobsWithCounts = (jobsData || []).map(job => ({
          ...job,
          actual_contact_count: job.search_id ? (contactCountsBySearchId[job.search_id] || 0) : 0
        }));
        setJobs(jobsWithCounts);
      } else {
        setJobs(jobsData || []);
      }

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

  const exportContacts = () => {
    if (contacts.length === 0) {
      toast({
        title: "Nessun contatto",
        description: "Non ci sono contatti da esportare",
        variant: "destructive",
      });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(
      contacts.map(c => ({
        Nome: c.name || '',
        Organizzazione: c.organization || '',
        Email: c.email || '',
        Telefono: c.phone || '',
        Sito: c.website || '',
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contatti');
    XLSX.writeFile(workbook, `${batch?.name || 'batch'}_contatti.xlsx`);

    toast({
      title: "✓ Export completato",
      description: `${contacts.length} contatti esportati`,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      running: "default",
      completed: "outline",
      failed: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status.toUpperCase()}</Badge>;
  };

  const getProgress = () => {
    if (!batch || batch.total_jobs === 0) return 0;
    return Math.round((batch.completed_jobs / batch.total_jobs) * 100);
  };

  if (loading || !batch) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/batch')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna ai Batch
          </Button>
          <div className="flex-1">
            <h1 className="text-4xl font-bold">{batch.name}</h1>
            {batch.description && (
              <p className="text-muted-foreground mt-1">{batch.description}</p>
            )}
          </div>
          {getStatusBadge(batch.status)}
        </div>

        {/* Stats Card */}
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle>Progresso Batch</CardTitle>
            <CardDescription>
              {batch.completed_jobs} / {batch.total_jobs} ricerche completate
              {batch.failed_jobs > 0 && ` • ${batch.failed_jobs} fallite`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={getProgress()} className="h-3" />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="text-3xl font-bold text-primary">{contacts.length}</div>
                <div className="text-sm text-muted-foreground">Contatti Trovati</div>
              </div>
              <div className="p-4 bg-secondary/10 rounded-lg">
                <div className="text-3xl font-bold text-secondary">{batch.completed_jobs}</div>
                <div className="text-sm text-muted-foreground">Completate</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-3xl font-bold">{batch.total_jobs - batch.completed_jobs - batch.failed_jobs}</div>
                <div className="text-sm text-muted-foreground">In Coda</div>
              </div>
              <div className="p-4 bg-destructive/10 rounded-lg">
                <div className="text-3xl font-bold text-destructive">{batch.failed_jobs}</div>
                <div className="text-sm text-muted-foreground">Fallite</div>
              </div>
            </div>

            <Button onClick={exportContacts} className="w-full" disabled={contacts.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Esporta {contacts.length} Contatti in Excel
            </Button>
          </CardContent>
        </Card>

        {/* Jobs Status */}
        <Card>
          <CardHeader>
            <CardTitle>Ricerche del Batch</CardTitle>
            <CardDescription>Stato di ogni ricerca nel batch</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Località</TableHead>
                  <TableHead>Pagine</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Contatti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs max-w-md truncate">
                      {job.query}
                    </TableCell>
                    <TableCell>{job.location || '-'}</TableCell>
                    <TableCell>{job.pages}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {job.actual_contact_count ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Contacts Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Contatti Trovati ({contacts.length})</CardTitle>
                <CardDescription>Tutti i contatti estratti da questo batch</CardDescription>
              </div>
              <Button variant="outline" onClick={loadBatchData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nessun contatto trovato ancora...</p>
                {batch.status === 'running' && (
                  <p className="text-sm mt-2">Le ricerche sono in corso, controlla tra qualche minuto</p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Organizzazione</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefono</TableHead>
                    <TableHead>Sito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name || '-'}</TableCell>
                      <TableCell>
                        {contact.organization && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {contact.organization}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-primary hover:underline">
                            <Mail className="h-4 w-4" />
                            {contact.email}
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {contact.phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.website && (
                          <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                            <Globe className="h-4 w-4" />
                            {contact.website}
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
