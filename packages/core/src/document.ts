import type { Spec } from '@json-render/core';
import { catalog as defaultCatalog } from './catalog';
import { cloneJSON, UIValidationError, validateUI, type ValidationOptions } from './validation';

export interface UIDocument { catalogVersion: string; spec: Spec; state: Record<string, unknown> }
export function createUIDocument(spec: unknown, options: ValidationOptions & { state?: Record<string, unknown> } = {}): UIDocument {
  const cat = options.catalog ?? defaultCatalog;
  const validated = validateUI(spec, { catalog: cat });
  const state = cloneJSON(options.state !== undefined ? options.state : validated.state ?? {});
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new UIValidationError([{ code: 'document_state', path: 'state', message: 'State must be a JSON object' }]);
  return { catalogVersion: cat.version, spec: validated, state };
}
export function serializeUIDocument(doc: UIDocument): string {
  return JSON.stringify(cloneJSON(doc));
}
export function parseUIDocument(json: string, options: ValidationOptions = {}): UIDocument {
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new UIValidationError([{ code: 'document_json', path: '', message: 'Invalid JSON document' }]); }
  const doc = cloneJSON(value) as UIDocument;
  const cat = options.catalog ?? defaultCatalog;
  if (!doc || typeof doc !== 'object' || Object.keys(doc).sort().join(',') !== 'catalogVersion,spec,state') throw new UIValidationError([{ code: 'document_shape', path: '', message: 'Expected catalogVersion, spec and state' }]);
  if (doc.catalogVersion !== cat.version) throw new UIValidationError([{ code: 'catalog_version', path: 'catalogVersion', message: 'Catalog version mismatch' }]);
  if (!doc.state || Array.isArray(doc.state) || typeof doc.state !== 'object') throw new UIValidationError([{ code: 'document_state', path: 'state', message: 'State must be a JSON object' }]);
  return createUIDocument(doc.spec, { catalog: cat, state: doc.state });
}
