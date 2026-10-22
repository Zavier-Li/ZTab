import {createPortal} from 'react-dom';
import {useLayoutEffect,useState,useRef} from 'react';
import { t as tr } from "@/lib/i18n";
import type { ReactNode } from "react";
import { Inbox, ArrowUpRight, Search } from "lucide-react";
import type { Project } from "@/lib/types";
import { Button } from "./ui/button";
export interface PageProps {
  p: Project;
  update: (p: Project) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  go: (page: string) => void;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const [target,setTarget]=useState<HTMLElement|null>(null);useLayoutEffect(()=>{const current=document.getElementById('page-toolbar');if(current!==target)setTarget(current)});return actions&&target?createPortal(actions,target):null;

}
export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: "green" | "orange" | "gray" | "blue";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>

      {action}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = tr("搜索…"),
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>

        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </Button>
  );
}

export function TableFrame({children}:{children:ReactNode}){const ref=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{const table=ref.current?.querySelector('table');if(!table)return;const labels=Array.from(table.querySelectorAll('thead tr:first-child th')).map(th=>th.textContent?.trim()??'');table.querySelectorAll('tbody tr').forEach(row=>row.querySelectorAll('td').forEach((cell,i)=>{if(!cell.dataset.label)cell.dataset.label=labels[i]??''}))},[children]);return <div className="table-scroll" ref={ref}>{children}</div>}
