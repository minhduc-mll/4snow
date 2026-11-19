"use client";

import type { ComponentProps } from "react";
import { Input as ShadcnInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof ShadcnInput>, "type">;

export function Checkbox({ className, ...props }: Props) {
  return <ShadcnInput type="checkbox" className={cn("size-4 shrink-0 p-0", className)} {...props} />;
}
