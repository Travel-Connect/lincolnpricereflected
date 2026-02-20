"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import type {
  Facility,
  UserLincolnCredentials,
  Environment,
} from "@/lib/types/database";

interface AppContextType {
  user: User;
  credentials: UserLincolnCredentials | null;
  facilities: Facility[];
  currentFacility: Facility | null;
  setCurrentFacility: (f: Facility) => void;
  environment: Environment;
  setEnvironment: (env: Environment) => void;
}

const AppContext = createContext<AppContextType | null>(null);

interface AppProviderProps {
  children: ReactNode;
  user: User;
  credentials: UserLincolnCredentials | null;
  facilities: Facility[];
}

export function AppProvider({
  children,
  user,
  credentials,
  facilities,
}: AppProviderProps) {
  const defaultFacility =
    facilities.find((f) => f.id === credentials?.default_facility_id) ??
    facilities[0] ??
    null;

  const [currentFacility, setCurrentFacility] = useState<Facility | null>(
    defaultFacility
  );
  const [environment, setEnvironment] = useState<Environment>("production");

  return (
    <AppContext.Provider
      value={{
        user,
        credentials,
        facilities,
        currentFacility,
        setCurrentFacility,
        environment,
        setEnvironment,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
