import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, ArrowLeft, Search, FileText, Trash2, Play, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface ValidationList {
  id: string;
  name: string;
  total_emails: number;
  processed_emails: number;
  deliverable_count: number;
  undeliverable_count: number;
  risky_count: number;
  unknown_count: number;
  status: string;
  created_at: string;
}

interface ValidationResult {
  id: string;
  email: string;
  result: string;
  format_valid: boolean;
  domain_valid: boolean;
  smtp_valid: boolean;
  catch_all: boolean;
  disposable: boolean;
  free_email: boolean;
  reason: string | null;
  deliverable: boolean;
  full_response: any;
}

const Validate = () => {
  const navigate = useNavigate();
  const [emails, setEmails] = useState<string[]>([]);
  const [pastedEmails, setPastedEmails] = useState("");
  const [listName, setListName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [validationHistory, setValidationHistory] = useState<ValidationList[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadValidationHistory();
  }, []);

  const loadValidationHistory = async () => {
    const { data, error } = await supabase
      .from("validation_lists")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading history:", error);
      return;
    }

    setValidationHistory(data || []);
  };

  const deleteList = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    
    try {
      // Delete results first
      await supabase.from("validation_results").delete().eq("validation_list_id", id);
      // Delete contacts
      await supabase.from("contacts").delete().eq("list_id", id);
      // Delete list
      const { error } = await supabase.from("validation_lists").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Lista eliminata",
        description: "La lista è stata rimossa correttamente",
      });
      loadValidationHistory();
    } catch (error) {
      console.error("Error deleting list:", error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare la lista",
        variant: "destructive",
      });
    }
  };

  const handlePasteEmails = () => {
    const lines = pastedEmails.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const emailList: string[] = [];
    
    lines.forEach(line => {
      // Extract emails from each line (in case there's text around them)
      const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
      const matches = line.match(emailRegex);
      if (matches) {
        emailList.push(...matches);
      }
    });

    const uniqueEmails = [...new Set(emailList)];
    setEmails(uniqueEmails);
    toast({
      title: "Email incollate",
      description: `${uniqueEmails.length} email uniche trovate`,
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        const emailList: string[] = [];
        jsonData.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              if (typeof cell === "string" && cell.includes("@")) {
                emailList.push(cell.trim());
              }
            });
          }
        });

        setEmails([...new Set(emailList)]);
        
        // Auto-set list name from file name if empty
        if (!listName && file.name) {
          const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
          setListName(nameWithoutExt);
        }

        toast({
          title: "File caricato",
          description: `${emailList.length} email uniche trovate`,
        });
      } catch (error) {
        toast({
          title: "Errore",
          description: "Impossibile leggere il file",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleValidateNow = async () => {
    if (emails.length === 0) {
      toast({
        title: "Nessuna email",
        description: "Carica prima un file con le email",
        variant: "destructive",
      });
      return;
    }

    if (!listName) {
      toast({
        title: "Nome richiesto",
        description: "Inserisci un nome per questa lista",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // 2. Create List with status 'processing' immediately
      const { data: list, error: listError } = await supabase
        .from("validation_lists")
        .insert({
          name: listName,
          user_id: user.id,
          total_emails: emails.length,
          status: 'processing',
          processed_emails: 0
        })
        .select()
        .single();

      if (listError) throw listError;

      // 3. Insert Contacts (in batches of 1000 to be safe)
      const contactsData = emails.map(email => ({
        list_id: list.id,
        email: email,
        name: email.split('@')[0] // Simple name extraction
      }));

      const batchSize = 1000;
      for (let i = 0; i < contactsData.length; i += batchSize) {
        const batch = contactsData.slice(i, i + batchSize);
        const { error: contactsError } = await supabase
          .from("contacts")
          .insert(batch);
        
        if (contactsError) throw contactsError;
      }

      // 4. Trigger Validation Immediately
      const { error: validationError } = await supabase.functions.invoke("validate-batch", {
        body: { 
          emails, 
          listName: list.name,
          existingListId: list.id 
        },
      });

      if (validationError) throw validationError;

      toast({
        title: "🚀 Validazione avviata",
        description: "Analisi della lista in corso...",
      });

      // 5. Navigate immediately to results
      navigate(`/validate/${list.id}`);
      
    } catch (error: any) {
      console.error("Error creating list:", error);
      toast({
        title: "Errore",
        description: error.message || "Impossibile avviare la validazione",
        variant: "destructive",
      });
      setIsCreating(false); // Only reset if error, otherwise we navigate away
    }
  };

  const filteredLists = validationHistory.filter((list) =>
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    if (status === "completed") {
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Completata</Badge>;
    }
    if (status === "unvalidated") {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Da validare</Badge>;
    }
    if (status === "processing") {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">In corso...</Badge>;
    }
    if (status === "pending") {
      return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">In attesa</Badge>;
    }
    if (status === "failed") {
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Fallita</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="mb-4 text-slate-400 hover:text-slate-200">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <h1 className="text-4xl font-bold mb-2 text-white">Validazione Lista</h1>
          <p className="text-slate-400">
            Valida più indirizzi email contemporaneamente ed esporta i risultati • Validazioni illimitate
          </p>
        </div>

        {/* Pick a Source */}
        <Card className="p-6 mb-6 bg-slate-900/50 border-slate-800">
          <h2 className="text-lg font-semibold mb-4 text-white">Scegli una Sorgente</h2>
          
          <div className="space-y-4">
            <Input
              placeholder="Nome lista (es: Lista clienti Q4 2024)"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              disabled={isCreating}
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
            />

            <Tabs defaultValue="paste" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-800/50">
                <TabsTrigger value="paste" className="data-[state=active]:bg-slate-700">
                  <FileText className="mr-2 h-4 w-4" />
                  Incolla una lista
                </TabsTrigger>
                <TabsTrigger value="upload" className="data-[state=active]:bg-slate-700">
                  <Upload className="mr-2 h-4 w-4" />
                  Carica un file
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="paste" className="space-y-3">
                <Textarea
                  placeholder="Incolla le email qui (una per riga o separate da virgole)&#10;esempio@email.com&#10;altro@email.com"
                  value={pastedEmails}
                  onChange={(e) => setPastedEmails(e.target.value)}
                  disabled={isCreating}
                  className="min-h-[200px] bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 font-mono text-sm"
                />
                <Button
                  onClick={handlePasteEmails}
                  disabled={isCreating || !pastedEmails.trim()}
                  variant="outline"
                  className="w-full bg-slate-800/30 border-slate-700 hover:bg-slate-800 text-slate-300"
                >
                  Estrai Email
                </Button>
              </TabsContent>
              
              <TabsContent value="upload" className="space-y-3">
                <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-slate-600 transition-colors">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-slate-500" />
                  <p className="text-sm text-slate-400 mb-2">
                    Carica un file CSV o Excel
                  </p>
                  <Button
                    variant="outline"
                    className="bg-slate-800/30 border-slate-700 hover:bg-slate-800 text-slate-300 relative"
                    asChild
                  >
                    <label>
                      Seleziona file
                      <Input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileUpload}
                        disabled={isCreating}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {emails.length > 0 && (
              <div className="bg-slate-800/30 p-4 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-white">Email da validare:</span>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {emails.length} email
                  </Badge>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1 text-sm mb-3">
                  {emails.slice(0, 10).map((email, idx) => (
                    <div key={idx} className="text-slate-400 font-mono text-xs">
                      {email}
                    </div>
                  ))}
                  {emails.length > 10 && (
                    <div className="text-slate-500 italic text-xs">
                      ... e altre {emails.length - 10} email
                    </div>
                  )}
                </div>
                
                <Button
                  onClick={handleValidateNow}
                  disabled={isCreating}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20"
                  size="lg"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Avvio validazione...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-5 w-5" />
                      Valida Ora
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* My Lists */}
        <Card className="p-6 bg-slate-900/50 border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Le Mie Liste ({filteredLists.length})
            </h2>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Cerca liste..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          {filteredLists.length > 0 ? (
            <div className="space-y-3">
              {filteredLists.map((list) => (
                <div
                  key={list.id}
                  onClick={() => navigate(`/validate/${list.id}`)}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-800/30 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">{list.name}</h3>
                      {getStatusBadge(list.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <span>
                        Creata {new Date(list.created_at).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span>{list.total_emails} email</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={
                        list.status === "unvalidated"
                          ? "text-amber-400 hover:text-amber-300 hover:bg-amber-900/20"
                          : "text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20"
                      }
                    >
                      <Search className="mr-2 h-4 w-4" />
                      {list.status === "unvalidated" ? "Valida" : "Vedi risultati"}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-500 hover:text-red-400 hover:bg-red-900/20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-900 border-slate-800 text-white" onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina Lista</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            Sei sicuro di voler eliminare la lista "{list.name}"? Questa azione non può essere annullata.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={(e) => deleteList(list.id, e)} className="bg-red-600 hover:bg-red-700 text-white">Elimina</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p>Nessuna lista trovata</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Validate;
