import { cn } from "@/lib/utils";

interface TextareaProps {
  label?: string;
  error?: string;
  rows?: number;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Textarea({
  label,
  error,
  rows = 4,
  placeholder,
  value,
  onChange,
  disabled,
  className,
  id,
  ...props
}: TextareaProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          "w-full bg-canvas text-ink font-body text-[16px] rounded-md px-3.5 py-2.5",
          "border outline-none transition-shadow resize-y min-h-[80px]",
          error
            ? "border-error focus:border-error focus:ring-2 focus:ring-error/20"
            : "border-hairline focus:border-primary focus:ring-2 focus:ring-primary/20",
          className
        )}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}