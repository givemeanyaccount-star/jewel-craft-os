import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import RoleManagement from "./pages/RoleManagement";
import Inventory from "./pages/Inventory";
import ItemDetail from "./pages/ItemDetail";
import ScanQR from "./pages/ScanQR";
import Customers from "./pages/Customers";
import Quotations from "./pages/Quotations";
import QuotationDetail from "./pages/QuotationDetail";
import POS from "./pages/POS";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import OldGold from "./pages/OldGold";
import MetalRates from "./pages/MetalRates";
import Settings from "./pages/Settings";
import CreditLedger from "./pages/CreditLedger";
import Repairs from "./pages/Repairs";
import RepairDetail from "./pages/RepairDetail";
import PurchaseDetail from "./pages/PurchaseDetail";
import Suppliers from "./pages/Suppliers";
import Karigars from "./pages/Karigars";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const SALES = ["admin", "manager", "sales"] as const;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
            <Route path="/inventory/:id" element={<ProtectedRoute><ItemDetail /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute roles={[...SALES]}><ScanQR /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
            <Route path="/quotations" element={<ProtectedRoute roles={[...SALES]}><Quotations /></ProtectedRoute>} />
            <Route path="/quotations/:id" element={<ProtectedRoute roles={[...SALES]}><QuotationDetail /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute roles={[...SALES]}><POS /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/credit" element={<ProtectedRoute><CreditLedger /></ProtectedRoute>} />
            <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
            <Route path="/old-gold" element={<ProtectedRoute roles={[...SALES]}><OldGold /></ProtectedRoute>} />
            <Route path="/rates" element={<ProtectedRoute><MetalRates /></ProtectedRoute>} />
            <Route path="/repairs" element={<ProtectedRoute><Repairs /></ProtectedRoute>} />
            <Route path="/repairs/karigars" element={<ProtectedRoute><Karigars /></ProtectedRoute>} />
            <Route path="/repairs/:id" element={<ProtectedRoute><RepairDetail /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute roles={["admin", "manager"]}><Suppliers /></ProtectedRoute>} />
            <Route path="/purchases/:id" element={<ProtectedRoute roles={["admin", "manager"]}><PurchaseDetail /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute roles={["admin", "manager"]}><Settings /></ProtectedRoute>} />
            <Route path="/admin/roles" element={<ProtectedRoute roles={["admin"]}><RoleManagement /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
