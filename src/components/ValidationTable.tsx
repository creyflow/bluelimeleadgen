import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ValidationResult } from "@/types/validation";

interface ValidationTableProps {
  results: ValidationResult[];
  deleteEmail: (id: string) => void;
}

export const ValidationTable = ({ results, deleteEmail }: ValidationTableProps) => {
  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Email</h2>
        <Badge className="bg-slate-700 text-slate-300">
          Limitata a 250 righe
        </Badge>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        La seguente tabella mostra un campione della lista. Puoi scaricare la lista completa cliccando il pulsante sopra.
      </p>

      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-800/50 hover:bg-slate-800/50">
              <TableHead className="text-slate-300">Email</TableHead>
              <TableHead className="text-slate-300">Risultato</TableHead>
              <TableHead className="text-slate-300">Motivo</TableHead>
              <TableHead className="text-slate-300 text-center">Formato</TableHead>
              <TableHead className="text-slate-300 text-center">Dominio</TableHead>
              <TableHead className="text-slate-300 text-center">Deliverable</TableHead>
              <TableHead className="text-slate-300 text-center">Catch-all</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => (
              <TableRow
                key={result.id}
                className="border-slate-700 hover:bg-slate-800/30"
              >
                <TableCell className="font-mono text-sm text-slate-300">
                  {result.email}
                </TableCell>
                <TableCell>
                  <Badge
                    className={
                      result.result === "deliverable"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : result.result === "undeliverable"
                        ? "bg-red-500/20 text-red-400 border-red-500/30"
                        : result.result === "risky"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-slate-500/20 text-slate-400 border-slate-500/30"
                    }
                  >
                    {result.result}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-slate-400">
                  {result.reason || "-"}
                </TableCell>
                <TableCell className="text-center">
                  {result.format_valid ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {result.domain_valid ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {result.deliverable ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-red-400">✗</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {result.catch_all ? (
                    <span className="text-slate-400">✓</span>
                  ) : (
                    <span className="text-slate-600">✗</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-white">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 text-slate-200">
                      <DropdownMenuItem 
                        onClick={() => deleteEmail(result.id)}
                        className="text-red-400 focus:text-red-300 focus:bg-red-900/20"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};
