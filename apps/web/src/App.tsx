import { BrowserRouter } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { CrmRoutes } from "./components/CrmRoutes";
import { authConfigured } from "./hexclave/client";

export default function App() {
  return (
    <BrowserRouter>
      {authConfigured ? <AuthGate /> : <CrmRoutes />}
    </BrowserRouter>
  );
}
