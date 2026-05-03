"use client";

import * as React from "react";

import {
  Dialog as ShadcnDialog,
  DialogContent as ShadcnDialogContent,
  DialogDescription as ShadcnDialogDescription,
  DialogFooter as ShadcnDialogFooter,
  DialogHeader as ShadcnDialogHeader,
  DialogTitle as ShadcnDialogTitle,
} from "@/components/ui/dialog";

type DialogRootProps = React.ComponentProps<typeof ShadcnDialog>;
type DialogContentProps = React.ComponentProps<typeof ShadcnDialogContent>;
type DialogHeaderProps = React.ComponentProps<typeof ShadcnDialogHeader>;
type DialogFooterProps = React.ComponentProps<typeof ShadcnDialogFooter>;
type DialogTitleProps = React.ComponentProps<typeof ShadcnDialogTitle>;
type DialogDescriptionProps = React.ComponentProps<typeof ShadcnDialogDescription>;

export function Dialog(props: DialogRootProps): React.ReactElement {
  return <ShadcnDialog {...props} />;
}

export function DialogContent(props: DialogContentProps): React.ReactElement {
  return <ShadcnDialogContent {...props} />;
}

export function DialogHeader(props: DialogHeaderProps): React.ReactElement {
  return <ShadcnDialogHeader {...props} />;
}

export function DialogFooter(props: DialogFooterProps): React.ReactElement {
  return <ShadcnDialogFooter {...props} />;
}

export function DialogTitle(props: DialogTitleProps): React.ReactElement {
  return <ShadcnDialogTitle {...props} />;
}

export function DialogDescription(
  props: DialogDescriptionProps,
): React.ReactElement {
  return <ShadcnDialogDescription {...props} />;
}
