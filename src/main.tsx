import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { RoundProvider } from "./round";
import "./index.css";
import { startUpdateCheck } from "./update";

startUpdateCheck();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RoundProvider>
        <App />
      </RoundProvider>
    </AuthProvider>
  </React.StrictMode>
);
