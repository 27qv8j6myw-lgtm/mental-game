import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./store";
import { AuthProvider } from "./auth";
import { RoundProvider } from "./round";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RoundProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </RoundProvider>
    </AuthProvider>
  </React.StrictMode>
);
