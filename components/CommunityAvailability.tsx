"use client";
import {createContext,useContext,type ReactNode} from 'react';
const Enabled=createContext(false);
export const useCommunitiesEnabled=()=>useContext(Enabled);
export function CommunityAvailability({enabled,children}:{enabled:boolean;children:ReactNode}){return <Enabled.Provider value={enabled}>{children}</Enabled.Provider>;}
