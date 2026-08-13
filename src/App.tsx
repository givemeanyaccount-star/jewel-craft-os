import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PrintPreviewHost } from "@/components/PrintPreview";

import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import RoleManagement from "./pages/RoleManagement";
import Inventory from "./pages/Inventory";
import ItemDetail from "./pages/ItemDetail";
import ScanQR from "./pages/ScanQR";
import Customers from "./pages/Customers";
import Quotations from "./pages/Quotations";
import QuotationDetail from "./pages/QuotationDetail";
import POS from "./pages/POS";
import Invoices from "./pages/Invoices";
import InvoicesOldGold from "./pages/InvoicesOldGold";
import SalesReturns from "./pages/SalesReturns";
import InvoiceDetail from "./pages/InvoiceDetail";
import Purchases from "./pages/Purchases";
import MetalRates from "./pages/MetalRates";
import Settings from "./pages/Settings";
import CreditLedger from "./pages/CreditLedger";
import Repairs from "./pages/Repairs";
import RepairDetail from "./pages/RepairDetail";
import PurchaseDetail from "./pages/PurchaseDetail";
import Suppliers from "./pages/Suppliers";
import Karigars from "./pages/Karigars";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const SALES = ["admin", "manager", "sales"] as const;
const ALL_ROLES_R = ["admin", "manager", "sales", "karigar", "accountant", "viewer"] as const;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PrintPreviewHost />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute roles={[...ALL_ROLES_R]}><Dashboard /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute roles={[...ALL_ROLES_R]}><Inventory /></ProtectedRoute>} />
            <Route path="/inventory/:id" element={<ProtectedRoute roles={[...ALL_ROLES_R]}><ItemDetail /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute roles={[...SALES]}><ScanQR /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute roles={[...SALES]}><Customers /></ProtectedRoute>} />
            <Route path="/quotations" element={<ProtectedRoute roles={[...SALES]}><Quotations /></ProtectedRoute>} />
            <Route path="/quotations/:id" element={<ProtectedRoute roles={[...SALES]}><QuotationDetail /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute roles={[...SALES]}><POS /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute roles={["admin", "manager", "sales", "accountant", "viewer"]}><Invoices /></ProtectedRoute>} />
            <Route path="/invoices/old-gold" element={<ProtectedRoute roles={[...SALES]}><InvoicesOldGold /></ProtectedRoute>} />
            <Route path="/returns" element={<ProtectedRoute roles={["admin", "manager", "sales"]}><SalesReturns /></ProtectedRoute>} />
            <Route path="/credit" element={<ProtectedRoute roles={["admin", "manager", "accountant"]}><CreditLedger /></ProtectedRoute>} />

            <Route path="/invoices/:id" element={<ProtectedRoute roles={["admin", "manager", "sales", "accountant", "viewer"]}><InvoiceDetail /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute roles={[...ALL_ROLES_R]}><Orders /></ProtectedRoute>} />
            <Route path="/orders/:id" element={<ProtectedRoute roles={[...ALL_ROLES_R]}><OrderDetail /></ProtectedRoute>} />
            <Route path="/purchases" element={<ProtectedRoute roles={["admin", "manager"]}><Purchases /></ProtectedRoute>} />
            <Route path="/rates" element={<ProtectedRoute roles={["admin", "manager", "accountant", "sales"]}><MetalRates /></ProtectedRoute>} />
            <Route path="/repairs" element={<ProtectedRoute roles={["admin", "manager", "karigar"]}><Repairs /></ProtectedRoute>} />
            <Route path="/repairs/karigars" element={<ProtectedRoute roles={["admin", "manager"]}><Karigars /></ProtectedRoute>} />
            <Route path="/repairs/:id" element={<ProtectedRoute roles={["admin", "manager", "karigar"]}><RepairDetail /></ProtectedRoute>} />
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
