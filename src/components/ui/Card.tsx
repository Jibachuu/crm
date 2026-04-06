import { cn } from "@/lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export function Card({ className, children }: CardProps) {
  return (
    <div
      className={cn("bg-white", className)}
      style={{ border: "1px solid #e4e4e4", borderRadius: 6 }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: CardProps) {
  return (
    <div
      className={cn("px-5 py-3", className)}
      style={{ borderBottom: "1px solid #e4e4e4" }}
    >
      {children}
    </div>
  );
}

export function CardBody({ className, children }: CardProps) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function CardFooter({ className, children }: CardProps) {
  return (
    <div
      className={cn("px-5 py-3 bg-gray-50", className)}
      style={{ borderTop: "1px solid #e4e4e4", borderRadius: "0 0 6px 6px" }}
    >
      {children}
    </div>
  );
}
