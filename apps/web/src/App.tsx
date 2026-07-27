import { BrowserRouter } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { CrmRoutes } from "./components/CrmRoutes";

export default function App({ authEnabled }: { authEnabled: boolean }) {
  return (
    <BrowserRouter>
      {authEnabled ? <AuthGate /> : <CrmRoutes />}
    </BrowserRouter>
  );
}
