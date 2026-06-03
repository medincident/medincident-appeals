"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  name: string;
  value?: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  align?: "start" | "center";
  children?: React.ReactNode;
}

export function Checkbox({
  name,
  value = "1",
  defaultChecked = false,
  checked: checkedProp,
  onCheckedChange,
  disabled,
  invalid,
  id,
  className,
  align = "start",
  children,
}: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = checkedProp !== undefined;
  const checked = isControlled ? checkedProp : internalChecked;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer gap-3 select-none",
        align === "center" ? "items-center" : "items-start",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
    >
      <input
        type="checkbox"
        id={inputId}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (!isControlled) setInternalChecked(e.target.checked);
          onCheckedChange?.(e.target.checked);
        }}
        className="peer sr-only"
        aria-invalid={invalid || undefined}
      />
      <span
        aria-hidden="true"
        className={cn(
          "size-5 shrink-0 rounded-md border-2 transition-colors",
          align === "start" && "mt-0.5",
          "flex items-center justify-center",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-card",
          checked
            ? "bg-primary border-primary"
            : "bg-card border-input hover:border-primary/50",
          invalid && !checked && "border-destructive"
        )}
      >
        <Check
          className={cn(
            "size-3.5 text-primary-foreground transition-opacity",
            checked ? "opacity-100" : "opacity-0"
          )}
          strokeWidth={3}
        />
      </span>
      {children && (
        <span className="flex-1 text-xs leading-relaxed text-muted-foreground">
          {children}
        </span>
      )}
    </label>
  );
}
