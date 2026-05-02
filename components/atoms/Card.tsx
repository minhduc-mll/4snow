"use client";

import * as React from "react";
import { motion, MotionProps } from "framer-motion";

import {
  Card as ShadcnCard,
  CardAction as ShadcnCardAction,
  CardContent as ShadcnCardContent,
  CardDescription as ShadcnCardDescription,
  CardFooter as ShadcnCardFooter,
  CardHeader as ShadcnCardHeader,
  CardTitle as ShadcnCardTitle,
} from "@/components/ui/card";

type ShadcnCardProps = React.ComponentProps<typeof ShadcnCard>;
type ShadcnCardHeaderProps = React.ComponentProps<typeof ShadcnCardHeader>;
type ShadcnCardContentProps = React.ComponentProps<typeof ShadcnCardContent>;
type ShadcnCardFooterProps = React.ComponentProps<typeof ShadcnCardFooter>;
type ShadcnCardTitleProps = React.ComponentProps<typeof ShadcnCardTitle>;
type ShadcnCardDescriptionProps = React.ComponentProps<
  typeof ShadcnCardDescription
>;
type ShadcnCardActionProps = React.ComponentProps<typeof ShadcnCardAction>;

export type CardProps = ShadcnCardProps & {
  noAnimate?: boolean;
} & Pick<MotionProps, "initial" | "animate" | "transition">;

export function Card({
  noAnimate = false,
  initial,
  animate,
  transition,
  ...props
}: CardProps): React.ReactElement {
  if (noAnimate) {
    return <ShadcnCard {...props} />;
  }

  return (
    <motion.div
      initial={initial ?? { opacity: 0, y: 8 }}
      animate={animate ?? { opacity: 1, y: 0 }}
      transition={transition ?? { duration: 0.22, ease: "easeOut" }}
    >
      <ShadcnCard {...props} />
    </motion.div>
  );
}

export function CardHeader(props: ShadcnCardHeaderProps): React.ReactElement {
  return <ShadcnCardHeader {...props} />;
}

export function CardContent(props: ShadcnCardContentProps): React.ReactElement {
  return <ShadcnCardContent {...props} />;
}

export function CardFooter(props: ShadcnCardFooterProps): React.ReactElement {
  return <ShadcnCardFooter {...props} />;
}

export function CardTitle(props: ShadcnCardTitleProps): React.ReactElement {
  return <ShadcnCardTitle {...props} />;
}

export function CardDescription(
  props: ShadcnCardDescriptionProps,
): React.ReactElement {
  return <ShadcnCardDescription {...props} />;
}

export function CardAction(props: ShadcnCardActionProps): React.ReactElement {
  return <ShadcnCardAction {...props} />;
}
