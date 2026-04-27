import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const chipVariants = cva(
  "inline-flex items-center gap-2 whitespace-nowrap rounded-full border h-8 text-xs font-medium transition-colors shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        primary:
          "px-3.5 border-border bg-card text-foreground/80 hover:bg-muted/60 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:border-primary",
        success:
          "px-3 border-success/40 bg-success/10 text-success hover:bg-success/15 data-[active=true]:bg-success data-[active=true]:text-success-foreground data-[active=true]:border-success",
      },
    },
    defaultVariants: { variant: "primary" },
  },
)

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {
  active: boolean
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ active, variant, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-active={active}
      aria-pressed={active}
      className={cn(chipVariants({ variant }), className)}
      {...props}
    />
  ),
)
Chip.displayName = "Chip"
