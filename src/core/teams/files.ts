import { checkFileAbort, withFileAbort, type FileOperationOptions } from './file-transfer';
import { storeAttachment, storageFileName as fileName, validateStorageFile } from './stored-file';
import { MAX_ATTACHMENTS, type Attachment } from './model';
import type { TeamsClient, UploadableFile } from './store';

type FileBlob = UploadableFile & Blob;
interface FileContext {
	available(channelId: string): boolean;
	canUpload(): boolean;
	upload(file: FileBlob, signal?: AbortSignal): Promise<Attachment>;
	post(channelId: string, text: string, attachments: Attachment[]): boolean;
}

/** Storage operations always capture the destination and use fresh storage names. */
export function createFileActions(
	context: FileContext,
): Pick<TeamsClient, 'saveFileCopy' | 'uploadFiles' | 'createWorkbook'> {
	function ready(channelId: string, options?: FileOperationOptions): void {
		checkFileAbort(options?.signal);
		if (!context.available(channelId)) throw new Error('The channel is no longer available');
		if (!context.canUpload()) throw new Error('Configure file storage before sharing files');
	}
	async function stored(
		file: FileBlob,
		prefix: string,
		options?: FileOperationOptions,
	): Promise<Attachment> {
		return storeAttachment(file, prefix, context.upload, options);
	}
	function shared(
		channelId: string,
		text: string,
		attachments: Attachment[],
		options?: FileOperationOptions,
	): void {
		checkFileAbort(options?.signal);
		if (!context.available(channelId))
			throw new Error('The channel is no longer available; the uploaded files were not shared');
		if (!context.post(channelId, text, attachments))
			throw new Error('The files could not be shared');
	}
	return {
		async saveFileCopy(channelId, file, options) {
			ready(channelId, options);
			options?.onProgress?.({
				phase: 'uploading',
				fileName: fileName(file.name),
				completed: 0,
				total: 1,
			});
			const attachment = await stored(file, 'copy', options);
			options?.onProgress?.({
				phase: 'uploaded',
				fileName: attachment.name,
				completed: 1,
				total: 1,
			});
			shared(channelId, `Saved a copy of ${attachment.name}`, [attachment], options);
			return attachment;
		},
		async uploadFiles(channelId, files, options) {
			ready(channelId, options);
			if (!files.length || files.length > MAX_ATTACHMENTS)
				throw new Error(`Choose between 1 and ${MAX_ATTACHMENTS} files`);
			files.forEach(validateStorageFile);
			const attachments: Attachment[] = [];
			for (const file of files) {
				ready(channelId, options);
				options?.onProgress?.({
					phase: 'uploading',
					fileName: fileName(file.name),
					completed: attachments.length,
					total: files.length,
				});
				attachments.push(await stored(file, 'file', options));
				options?.onProgress?.({
					phase: 'uploaded',
					fileName: fileName(file.name),
					completed: attachments.length,
					total: files.length,
				});
			}
			shared(channelId, 'Shared files', attachments, options);
			return attachments;
		},
		async createWorkbook(channelId, rawName, options) {
			ready(channelId, options);
			const stem = fileName(rawName)
				.replace(/\.xlsx$/iu, '')
				.trim()
				.slice(0, 75);
			if (!stem) throw new Error('Enter a workbook name');
			const name = `${stem}.xlsx`;
			options?.onProgress?.({ phase: 'preparing', fileName: name, completed: 0, total: 1 });
			checkFileAbort(options?.signal);
			// SpreadsheetML creation and serialization remain in the Excel engine.
			const [{ createWorkbook }, { saveXlsx }] = await Promise.all([
				import('../xlsx/workbook'),
				import('../xlsx/write/index'),
			]);
			checkFileAbort(options?.signal);
			const bytes = await withFileAbort(() => saveXlsx(createWorkbook()), options?.signal);
			ready(channelId, options);
			const file = Object.assign(
				new Blob([new Uint8Array(bytes)], {
					type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				}),
				{ name },
			);
			options?.onProgress?.({ phase: 'uploading', fileName: name, completed: 0, total: 1 });
			const attachment = await stored(file, 'workbook', options);
			options?.onProgress?.({ phase: 'uploaded', fileName: name, completed: 1, total: 1 });
			shared(channelId, `Created ${name}`, [attachment], options);
			return attachment;
		},
	};
}
