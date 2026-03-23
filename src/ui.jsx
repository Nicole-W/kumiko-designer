function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cn("rounded-lg border shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }) {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }) {
  return (
    <h3 className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ className, children, ...props }) {
  return <div className={cn("p-6 pt-0", className)} {...props}>{children}</div>;
}

export function Button({ className, variant = "default", children, ...props }) {
  const variantClass =
    variant === "secondary"
      ? "bg-neutral-200 text-neutral-900 hover:bg-neutral-300"
      : "bg-neutral-900 text-neutral-50 hover:bg-neutral-800";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClass,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-400 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, children, htmlFor, ...props }) {
  return (
    <label htmlFor={htmlFor} className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props}>
      {children}
    </label>
  );
}

export function ScrollArea({ className, children, ...props }) {
  return (
    <div className={cn("overflow-auto", className)} {...props}>
      {children}
    </div>
  );
}

export function Separator({ className, ...props }) {
  return <div role="separator" className={cn("h-px w-full shrink-0 bg-neutral-200", className)} {...props} />;
}
