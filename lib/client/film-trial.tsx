"use client";
import { createContext, useContext, type ReactNode } from "react";
import { isFilmTrialClaim } from "../domain/film-trial";
const FilmTrial = createContext(false);
export function FilmTrialProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <FilmTrial.Provider value={enabled}>{children}</FilmTrial.Provider>;
}
export function useFilmTrialClaim(id: string) {
  return isFilmTrialClaim(useContext(FilmTrial), id);
}
