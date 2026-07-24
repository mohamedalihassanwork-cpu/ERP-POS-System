import { type ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-800 truncate">{title}</h2>
          {subtitle && (
            <p className="text-slate-500 text-sm mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}
