import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import BatchManager from "./pages/BatchManager";
import BatchDetails from "./pages/BatchDetails";
import Contacts from "./pages/Contacts";
import Searches from "./pages/Searches";
import UserGuide from "./pages/UserGuide";
import Validate from "./pages/Validate";
import ValidationResults from "./pages/ValidationResults";
import Pricing from "./pages/Pricing";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename="/leads">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
          <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
          <Route path="/searches" element={<ProtectedRoute><Searches /></ProtectedRoute>} />
          <Route path="/batch" element={<ProtectedRoute><BatchManager /></ProtectedRoute>} />
          <Route path="/batch/:batchId" element={<ProtectedRoute><BatchDetails /></ProtectedRoute>} />
          <Route path="/validate" element={<ProtectedRoute><Validate /></ProtectedRoute>} />
          <Route path="/validate/:listId" element={<ProtectedRoute><ValidationResults /></ProtectedRoute>} />
          <Route path="/guide" element={<ProtectedRoute><UserGuide /></ProtectedRoute>} />
          <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
