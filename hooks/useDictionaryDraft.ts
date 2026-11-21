"use client";

import * as React from "react";

export type DictionaryDraft = {
  dirty: boolean;
  busy?: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
};

type DraftRef = { current: DictionaryDraft };
type DraftNavigation = {
  register: (draft: DraftRef) => () => void;
  request: (action: () => void) => void;
};

export const DictionaryDraftContext = React.createContext<DraftNavigation | null>(null);

export function useDictionaryDraft(draft: DictionaryDraft) {
  const context = React.useContext(DictionaryDraftContext);
  const latest = React.useRef(draft);
  React.useLayoutEffect(() => { latest.current = draft; });
  React.useEffect(() => context?.register(latest), [context]);
}

export function useDictionaryNavigation() {
  const context = React.useContext(DictionaryDraftContext);
  return context?.request ?? runAction;
}

function runAction(action: () => void) {
  action();
}

export function useDictionaryDraftNavigation() {
  const drafts = React.useRef(new Set<DraftRef>());
  const pending = React.useRef<(() => void) | null>(null);
  const currentUrl = React.useRef<string | null>(null);
  const bypass = React.useRef(false);
  const committing = React.useRef(false);
  const origin = React.useRef<HTMLElement | null>(null);
  const returnFocus = React.useRef(false);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const dirtyDrafts = React.useCallback(() => Array.from(drafts.current).filter(draft => draft.current.dirty), []);
  const hasBusyDraft = React.useCallback(() => dirtyDrafts().some(draft => draft.current.busy), [dirtyDrafts]);
  const perform = React.useCallback((action: () => void) => {
    action();
    currentUrl.current = window.location.href;
  }, []);
  const context = React.useMemo<DraftNavigation>(() => ({
    register(draft) {
      drafts.current.add(draft);
      return () => { drafts.current.delete(draft); };
    },
    request(action) {
      if (bypass.current || !dirtyDrafts().length) {
        perform(action);
        return;
      }
      if (pending.current) return;
      origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      pending.current = action;
      returnFocus.current = true;
      setFailed(false);
      setOpen(true);
    },
  }), [dirtyDrafts, perform]);

  const close = () => {
    pending.current = null;
    setOpen(false);
  };
  const continueEditing = () => { if (!committing.current) close(); };
  const finish = () => {
    const action = pending.current;
    returnFocus.current = false;
    close();
    bypass.current = true;
    try { if (action) perform(action); }
    finally { bypass.current = false; }
  };
  const discard = () => {
    if (committing.current || hasBusyDraft()) return;
    for (const draft of dirtyDrafts()) draft.current.discard();
    finish();
  };
  const save = async () => {
    if (committing.current || hasBusyDraft()) return;
    committing.current = true;
    setSaving(true);
    setFailed(false);
    try {
      for (const draft of dirtyDrafts()) {
        if (draft.current.dirty && !await draft.current.save()) {
          setFailed(true);
          return;
        }
      }
      finish();
    } catch { setFailed(true); }
    finally { committing.current = false; setSaving(false); }
  };

  React.useEffect(() => {
    currentUrl.current = window.location.href;
    let acceptedHash: string | null = null;
    const inDictionary = (url: URL) => url.hash === "#dictionary" || url.hash.startsWith("#dictionary/");
    const shouldGuard = () => dirtyDrafts().length > 0;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypass.current || !shouldGuard()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (bypass.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || !(event.target instanceof Element) || !inDictionary(new URL(window.location.href)) || !shouldGuard()) return;
      const control = event.target.closest("a[href], [data-admin-logout]");
      if (!(control instanceof HTMLElement)) return;
      if (control instanceof HTMLAnchorElement && (control.target || control.download || control.href === window.location.href)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      context.request(() => {
        if (control instanceof HTMLAnchorElement) acceptedHash = control.href;
        control.click();
      });
    };
    const interceptHistory = (event: Event, from: string, to: string) => {
      if (acceptedHash === to || bypass.current || !inDictionary(new URL(from)) || !shouldGuard()) return false;
      event.stopImmediatePropagation();
      window.history.pushState(window.history.state, "", from);
      context.request(() => {
        acceptedHash = to;
        window.history.back();
      });
      return true;
    };
    const onPopState = (event: PopStateEvent) => {
      const next = window.location.href;
      const previous = currentUrl.current;
      if (previous && previous !== next && previous.split("#")[0] === next.split("#")[0] && interceptHistory(event, previous, next)) return;
      currentUrl.current = next;
    };
    const onHashChange = (event: HashChangeEvent) => {
      if (event.newURL !== window.location.href) { event.stopImmediatePropagation(); return; }
      if (acceptedHash === event.newURL) acceptedHash = null;
      else if (interceptHistory(event, event.oldURL, event.newURL)) return;
      currentUrl.current = event.newURL;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHashChange, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHashChange, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [context, dirtyDrafts]);

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    if (returnFocus.current) origin.current?.focus();
  };
  return { context, open, saving, failed, save, discard, continueEditing, restoreFocus };
}
