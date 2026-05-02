"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { Badge as ShadcnBadge } from "@/components/ui/badge";

const MotionBadge = motion.create(ShadcnBadge);

type ShadcnBadgeProps = React.ComponentProps<typeof ShadcnBadge>;
type MotionBadgeProps = React.ComponentProps<typeof MotionBadge>;
type ShadcnBadgeVariant = NonNullable<ShadcnBadgeProps["variant"]>;

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

export interface BadgeProps
  extends Omit<MotionBadgeProps, "children" | "variant"> {
  children?: React.ReactNode;
  variant?: BadgeVariant;
}

const variantMap: Record<BadgeVariant, ShadcnBadgeVariant> = {
  neutral: "secondary",
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  outline: "outline",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "neutral",
      children,
      initial,
      animate,
      transition,
      ...props
    },
    ref,
  ) => {
    return (
      <MotionBadge
        ref={ref}
        variant={variantMap[variant]}
        initial={initial ?? { opacity: 0, scale: 0.98 }}
        animate={animate ?? { opacity: 1, scale: 1 }}
        transition={transition ?? { duration: 0.18, ease: "easeOut" }}
        {...props}
      >
        {children}
      </MotionBadge>
    );
  },
);

Badge.displayName = "Badge";
