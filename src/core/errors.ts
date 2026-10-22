import type { CoreError } from "../bindings";
import { CoreFailure } from "./db/client";
import { t } from "./i18n";

/** A sentence for the user; the technical detail of the core follows it. */
export function describeError(e: unknown): string {
  if (e instanceof CoreFailure) return describeCoreError(e.error);
  if (e instanceof Error) return e.message;
  return String(e);
}

export function describeCoreError(e: CoreError): string {
  const detail = "message" in e ? e.message : "";
  return t(`errors.${e.kind}`, { detail });
}
