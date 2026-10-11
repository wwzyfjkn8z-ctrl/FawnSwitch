import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { useSidebarCollapsed } from "@/hooks/useSidebarCollapsed";

const SidebarStateContext = createContext<{
  collapsed: boolean;
  toggle: () => void;
  navRef: RefObject<HTMLElement>;
} | null>(null);

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const navRef = useRef<HTMLElement>(null);
  const state = useSidebarCollapsed(navRef);
  return <SidebarStateContext.Provider value={{ ...state, navRef }}>{children}</SidebarStateContext.Provider>;
}

export const useSidebarState = () => useContext(SidebarStateContext);
