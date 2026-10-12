/**
 * What a refused edit says to the user: the plain reason. The stable code stays on the error
 * (`error.code`) for programs; it is not shown in the interface. Document content is plain text.
 */
export function editErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Superseded worker/load operations are cancellation, not a refused document edit. */
export function isEditCancellation(error: unknown): boolean {
	return !!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError';
}
