import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Download, Play, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ValidationCharts } from "@/components/ValidationCharts";
import { ValidationTable } from "@/components/ValidationTable";
import { ValidationList, ValidationResult } from "@/types/validation";

const ValidationResults = () => {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<ValidationList | null>(null);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isStartingValidation, setIsStartingValidation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (listId) {
      loadData(true);
    }
  }, [listId]);

  // Auto-refresh while processing (no extra worker calls)
  useEffect(() => {
    if (!list || list.status !== 'processing') return;
    
    const interval = setInterval(async () => {
      // 1. Force check with Truelist (in case webhook failed)
      // This will check all "processing" lists and update them if Truelist is done
      await supabase.functions.invoke('process-validation-batch');

      // 2. Reload data from DB to see the update
      loadData();
    }, 5000);

    return () => clearInterval(interval);
  }, [list?.status]);

  const loadData = async (initial = false) => {
    if (initial) setLoading(true);
    
    // Load list info
    const { data: listData } = await supabase
      .from("validation_lists")
      .select("*")
      .eq("id", listId)
      .single();

    if (listData) {
      setList(listData);
    }

    // Load results
    const { data: resultsData } = await supabase
      .from("validation_results")
      .select("*")
      .eq("validation_list_id", listId);

    if (resultsData && resultsData.length > 0) {
      setResults(resultsData);
    } else {
      // If no results, load contacts to show them as pending
      const { data: contactsData } = await supabase
        .from("contacts")
        .select("*")
        .eq("list_id", listId);
        
      if (contactsData) {
        // Map contacts to ValidationResult interface
        const pendingResults: ValidationResult[] = contactsData.map(c => ({
          id: c.id, // Use contact ID temporarily
          email: c.email || "",
          result: "pending",
          format_valid: true,
          domain_valid: true,
          smtp_valid: false,
          catch_all: false,
          disposable: false,
          free_email: false,
          reason: null,
          deliverable: false,
          full_response: null
        }));
        setResults(pendingResults);
      }
    }

    if (initial) setLoading(false);
  };

  const deleteList = async () => {
    if (!listId) return;
    setIsDeleting(true);
    try {
      // Delete results first (if cascade not set up, but usually it is)
      const { error: resultsError } = await supabase
        .from("validation_results")
        .delete()
        .eq("validation_list_id", listId);

      if (resultsError) throw resultsError;

      // Delete list
      const { error: listError } = await supabase
        .from("validation_lists")
        .delete()
        .eq("id", listId);

      if (listError) throw listError;

      toast({
        title: "Lista eliminata",
        description: "La lista e tutti i risultati sono stati eliminati",
      });
      navigate("/validate");
    } catch (error) {
      console.error("Error deleting list:", error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare la lista",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteEmail = async (resultId: string) => {
    try {
      // Try to delete from validation_results first
      const { error: resultError } = await supabase
        .from("validation_results")
        .delete()
        .eq("id", resultId);

      // If it fails or if we are in "pending" mode (using contact IDs), try deleting from contacts
      if (resultError || results.find(r => r.id === resultId)?.result === 'pending') {
         const { error: contactError } = await supabase
          .from("contacts")
          .delete()
          .eq("id", resultId);
          
         if (contactError) throw contactError;
      }

      setResults(results.filter(r => r.id !== resultId));
      toast({
        title: "Email eliminata",
        description: "L'email è stata rimossa dalla lista",
      });
    } catch (error) {
      console.error("Error deleting email:", error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare l'email",
        variant: "destructive",
      });
    }
  };

  const exportResults = (format: 'xlsx' | 'csv', onlyValid: boolean) => {
    const dataToExport = onlyValid
      ? results.filter((r) => r.deliverable)
      : results;

    const exportData = dataToExport.map((r) => ({
      Email: r.email,
      Result: r.result,
      Reason: r.reason || "",
      Format: r.format_valid ? "✓" : "✗",
      Domain: r.domain_valid ? "✓" : "✗",
      Deliverable: r.deliverable ? "✓" : "✗",
      "Catch-All": r.catch_all ? "Yes" : "No",
      Disposable: r.disposable ? "Yes" : "No",
      "Free Email": r.free_email ? "Yes" : "No",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");

    const fileName = `${list?.name}_${onlyValid ? "valid" : "all"}_${Date.now()}.${format}`;
    
    if (format === 'csv') {
      XLSX.writeFile(workbook, fileName, { bookType: 'csv' });
    } else {
      XLSX.writeFile(workbook, fileName);
    }

    toast({
      title: "Export completato",
      description: `${dataToExport.length} email esportate in ${format.toUpperCase()}`,
    });
  };

  const startValidation = async () => {
    if (!list || !listId) return;
    
    setIsStartingValidation(true);
    
    try {
      // Get emails from contacts linked to this list
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("email")
        .eq("list_id", listId)
        .not("email", "is", null);

      if (contactsError) throw contactsError;

      const emails = contacts
        ?.map(c => c.email)
        .filter((email): email is string => !!email) || [];

      if (emails.length === 0) {
        toast({
          title: "Nessuna email",
          description: "Non ci sono email da validare in questa lista",
          variant: "destructive",
        });
        setIsStartingValidation(false);
        return;
      }

      // Call validate-batch with existing list
      const { data, error } = await supabase.functions.invoke("validate-batch", {
        body: { 
          emails, 
          listName: list.name,
          existingListId: listId 
        },
      });

      if (error) throw error;

      toast({
        title: "✅ Validazione avviata",
        description: `${emails.length} email inviate a Truelist per la validazione`,
      });

      // Reload data to show processing status
      await loadData(true);

    } catch (error) {
      console.error("Error starting validation:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Errore",
        description: errorMessage || "Impossibile avviare la validazione",
        variant: "destructive",
      });
    } finally {
      setIsStartingValidation(false);
    }
  };

  if (loading || !list) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link to="/validate">
              <Button
                variant="ghost"
                size="sm"
                className="mb-3 text-slate-400 hover:text-slate-200"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna alle liste
              </Button>
            </Link>
            <h1 className="text-4xl font-bold text-white mb-1">{list.name}</h1>
            <p className="text-sm text-slate-400">
              Creata il {new Date(list.created_at).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </p>
          </div>
          
          <div className="flex gap-3">
            {list.status === "unvalidated" ? (
              <Button
                onClick={startValidation}
                disabled={isStartingValidation}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/30"
              >
                {isStartingValidation ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Avvio in corso...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Avvia Validazione
                  </>
                )}
              </Button>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-200"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-slate-200">
                    <DropdownMenuItem onClick={() => exportResults('xlsx', false)}>
                      Tutto (XLSX)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportResults('csv', false)}>
                      Tutto (CSV)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportResults('xlsx', true)} className="text-emerald-400">
                      Solo Valide (XLSX)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportResults('csv', true)} className="text-emerald-400">
                      Solo Valide (CSV)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    Questa azione non può essere annullata. Eliminerà permanentemente la lista "{list.name}" e tutti i risultati associati.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteList} className="bg-red-600 hover:bg-red-700 text-white">Elimina</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <ValidationCharts list={list} results={results} />
        <ValidationTable results={results} deleteEmail={deleteEmail} />
      </div>
    </div>
  );
};

export default ValidationResults;
