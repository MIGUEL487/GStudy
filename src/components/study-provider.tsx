import type React from 'react';
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { initialData, loadData, storageKey, type StudyData } from '@/lib/study-model';
type StudyValue={data:StudyData;ready:boolean;update:(fn:(d:StudyData)=>StudyData)=>boolean};
// Keep one context instance across hot reloads so provider and consumers always match.
const g=globalThis as {__gstudyContext?:React.Context<StudyValue|null>};
const StudyContext=(g.__gstudyContext??=createContext<StudyValue|null>(null));
export function StudyProvider({children}:{children:ReactNode}) {
 const [data,setData]=useState(initialData); const [ready,setReady]=useState(false); const current=useRef(data); const readable=useRef(true);
 useEffect(()=>{try {const loaded=loadData(localStorage);current.current=loaded;setData(loaded);}catch {readable.current=false;toast.error('Não foi possível carregar os dados deste navegador. Não sobrescreveremos seus dados.');}finally{setReady(true);}},[]);
 const update=(fn:(d:StudyData)=>StudyData)=>{try{if(!readable.current) throw new Error('Os dados salvos precisam ser recuperados antes de continuar.');const next=fn(current.current);localStorage.setItem(storageKey,JSON.stringify(next));current.current=next;setData(next);return true;}catch(error){toast.error(error instanceof Error?error.message:'Não foi possível salvar. Verifique o armazenamento do navegador.');return false;}};
 return <StudyContext.Provider value={{data,ready,update}}>{children}</StudyContext.Provider>;
}
export function useStudy(){const context=useContext(StudyContext);if(!context) throw new Error('StudyProvider missing');return context;}
