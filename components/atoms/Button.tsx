"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

import { Button as ShadcnButton } from "@/components/ui/button";

const MotionButton = motion.create(ShadcnButton);

type ShadcnButtonProps = React.ComponentProps<typeof ShadcnButton>;
type MotionButtonProps = React.ComponentProps<typeof MotionButton>;
type ShadcnButtonVariant = NonNullable<ShadcnButtonProps["variant"]>;
type ShadcnButtonSize = NonNullable<ShadcnButtonProps["size"]>;

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends Omit<MotionButtonProps, "children" | "size" | "variant"> {
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantMap: Record<ButtonVariant, ShadcnButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  ghost: "ghost",
  danger: "destructive",
};

const sizeMap: Record<ButtonSize, ShadcnButtonSize> = {
  sm: "sm",
  md: "default",
  lg: "lg",
  icon: "icon",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled,
      type = "button",
      leftIcon,
      rightIcon,
      children,
      whileTap,
      transition,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <MotionButton
        ref={ref}
        type={type}
        variant={variantMap[variant]}
        size={sizeMap[size]}
        disabled={isDisabled}
        data-loading={isLoading}
        whileTap={isDisabled ? undefined : (whileTap ?? { scale: 0.98 })}
        transition={transition ?? { duration: 0.16, ease: "easeOut" }}
        {...props}
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : leftIcon}
        {children}
        {!isLoading ? rightIcon : null}
      </MotionButton>
    );
  },
);

Button.displayName = "Button";
