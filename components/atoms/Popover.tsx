"use client";

import type * as React from "react";
import { Popover as ShadcnPopover, PopoverTrigger as ShadcnPopoverTrigger, PopoverContent as ShadcnPopoverContent } from "@/components/ui/popover";

export function Popover(props: React.ComponentProps<typeof ShadcnPopover>) { return <ShadcnPopover {...props} />; }
export function PopoverTrigger(props: React.ComponentProps<typeof ShadcnPopoverTrigger>) { return <ShadcnPopoverTrigger {...props} />; }
export function PopoverContent(props: React.ComponentProps<typeof ShadcnPopoverContent>) { return <ShadcnPopoverContent {...props} />; }
