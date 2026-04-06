import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
          {
            "text-white": variant === "primary" || variant === "danger",
            "bg-white border text-gray-700 hover:bg-gray-50":
              variant === "secondary",
            "text-gray-600 hover:bg-gray-100": variant === "ghost",
          },
          {
            "px-3 py-1.5 text-xs": size === "sm",
            "px-4 py-2 text-sm": size === "md",
            "px-5 py-2.5 text-sm": size === "lg",
          },
          className
        )}
        style={{
          borderRadius: 4,
          ...(variant === "primary"
            ? { background: "#0067a5", borderColor: "#0067a5" }
            : variant === "danger"
            ? { background: "#d32f2f", borderColor: "#d32f2f" }
            : variant === "secondary"
            ? { borderColor: "#d0d0d0" }
            : {}),
        }}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export default Button;
