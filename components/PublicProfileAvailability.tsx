"use client";
import {createContext,useContext,type ReactNode} from 'react';
const Enabled=createContext(false);
export const usePublicProfilesEnabled=()=>useContext(Enabled);
export function PublicProfileAvailability({enabled,children}:{enabled:boolean;children:ReactNode}) {return <Enabled.Provider value={enabled}>{children}</Enabled.Provider>;}
