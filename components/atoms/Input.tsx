"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { Input as ShadcnInput } from "@/components/ui/input";

const MotionInput = motion.create(ShadcnInput);

type MotionInputProps = React.ComponentProps<typeof MotionInput>;

export type InputProps = MotionInputProps;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ whileFocus, transition, ...props }, ref) => {
    return (
      <MotionInput
        ref={ref}
        whileFocus={whileFocus ?? { scale: 1.005 }}
        transition={transition ?? { duration: 0.16, ease: "easeOut" }}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
