/// <reference lib="webworker" />
import { convertMetafileToSvgTree } from 'emf-converter';
import { editVsdx, parseVsdx } from 'ooxml-core/visio';
import type { EditWorkerRequest } from './worker-editor';
import { installBrowserTextMeasurer } from './text-measurer';
const worker = self as unknown as DedicatedWorkerGlobalScope;
// Shapes that size themselves from their text are measured with this browser's fonts when the
// core's own tables do not cover them.
installBrowserTextMeasurer();
worker.onmessage = async (event: MessageEvent<EditWorkerRequest>) => {
	if (event.origin && event.origin !== self.location.origin) return;
	try {
		const result = await editVsdx(event.data.bytes, event.data.edits);
		const document = await parseVsdx(result.bytes, { metafileConverter: convertMetafileToSvgTree });
		worker.postMessage({ ok: true, ...result, document }, [result.bytes.buffer]);
	} catch (cause) {
		worker.postMessage({
			ok: false,
			message: cause instanceof Error ? cause.message : String(cause),
			code:
				cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string'
					? cause.code
					: undefined,
		});
	}
};
