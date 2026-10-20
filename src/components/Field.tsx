import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, className, ...rest }, ref) => (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400",
          "focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition",
          className,
        )}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  ),
);
Field.displayName = "Field";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, options, placeholder, className, ...rest }, ref) => (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <select
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white",
          "focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition",
          className,
        )}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  ),
);
SelectField.displayName = "SelectField";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
};

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, className, ...rest }, ref) => (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400",
          "focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition",
          className,
        )}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  ),
);
TextareaField.displayName = "TextareaField";
