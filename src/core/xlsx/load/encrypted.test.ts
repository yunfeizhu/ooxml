import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { decryptOoxmlPackage, isEncryptedOoxmlPackage } from '../../crypto/index';
import { getCell, putCell } from '../cells';
import { createWorkbook } from '../workbook';
import { detectWorkbookFormat, loadWorkbook, saveWorkbook } from './detect';
import { IncorrectPasswordError, PasswordRequiredError, UnsupportedWorkbookError } from './errors';
import { LegacyXlsError } from './legacy-xls';

const fixture = async (path: string): Promise<Uint8Array> =>
	new Uint8Array(await readFile(new URL(`../__fixtures__/${path}`, import.meta.url)));

// excel-encrypted.xlsx: saved by Excel 16 with the password to open 'open sesame'
// (encrypted/generate-excel-encrypted.ps1). Excel's agile scheme spins SHA-512 100,000 times.
const PASSWORD = 'open sesame';

describe('encrypted workbooks', () => {
	it('tells an encrypted package from a legacy .xls', async () => {
		const encrypted = await fixture('encrypted/excel-encrypted.xlsx');
		expect(isEncryptedOoxmlPackage(encrypted)).toBe(true);
		expect(detectWorkbookFormat(encrypted)).toBe('encrypted');
		expect(detectWorkbookFormat(await fixture('xls/workbook-styles.xls'))).toBe('xls');
		// An RC4-encrypted .xls is still a legacy workbook with its own error.
		const rc4 = await fixture('xls/workbook-encrypted.xls');
		expect(detectWorkbookFormat(rc4)).toBe('xls');
		await expect(loadWorkbook(rc4, { password: 'x' })).rejects.toBeInstanceOf(LegacyXlsError);
	});

	it('asks for the password instead of reporting a protected .xls', async () => {
		const encrypted = await fixture('encrypted/excel-encrypted.xlsx');
		const error = await loadWorkbook(encrypted).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(PasswordRequiredError);
		expect((error as PasswordRequiredError).code).toBe('password-required');
		expect((error as Error).message).not.toMatch(/\.xls/);
	});

	it('rejects a wrong password with a typed error', async () => {
		const error = await loadWorkbook(await fixture('encrypted/excel-encrypted.xlsx'), {
			password: 'wrong',
		}).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(IncorrectPasswordError);
		expect((error as IncorrectPasswordError).code).toBe('incorrect-password');
	}, 60_000);

	it('opens the Excel-encrypted workbook with its password', async () => {
		const workbook = await loadWorkbook(await fixture('encrypted/excel-encrypted.xlsx'), {
			password: PASSWORD,
		});
		const sheet = workbook.sheets[0]!;
		expect(sheet.name).toBe('Secret');
		expect(getCell(sheet, 1, 0)?.value).toBe('Apple');
		expect(getCell(sheet, 3, 1)?.formula).toBe('SUM(B2:B3)');
		expect(getCell(sheet, 3, 1)?.value).toBe(7);
		expect(workbook.warnings.some((warning) => /password/.test(warning))).toBe(true);
		// RemovePersonalInformation: the committed fixture carries no account name.
		const zip = await JSZip.loadAsync(
			await decryptOoxmlPackage(await fixture('encrypted/excel-encrypted.xlsx'), PASSWORD),
		);
		const core = (await zip.file('docProps/core.xml')?.async('string')) ?? '';
		expect(core).not.toMatch(/<dc:creator>[^<]+<\/dc:creator>/);
		expect(core).not.toMatch(/<cp:lastModifiedBy>[^<]+<\/cp:lastModifiedBy>/);
	}, 60_000);

	it('saves with a password and opens the result again', async () => {
		const workbook = createWorkbook();
		putCell(workbook.sheets[0]!, 0, 0, { value: 'classified' });
		const encrypted = await saveWorkbook(workbook, 'xlsx', {
			password: PASSWORD,
			encryption: { spinCount: 1000 },
		});
		expect(detectWorkbookFormat(encrypted)).toBe('encrypted');
		await expect(loadWorkbook(encrypted)).rejects.toBeInstanceOf(PasswordRequiredError);
		const reopened = await loadWorkbook(encrypted, { password: PASSWORD });
		expect(getCell(reopened.sheets[0]!, 0, 0)?.value).toBe('classified');
		await expect(saveWorkbook(workbook, 'csv', { password: PASSWORD })).rejects.toThrow(/CSV/);
		// The positional sheet index still works.
		expect((await saveWorkbook(workbook, 'csv', 0)).length).toBeGreaterThan(3);
	});
});

describe('Excel Binary Workbooks', () => {
	it('refuses an .xlsb with a typed error', async () => {
		const zip = new JSZip();
		zip.file(
			'[Content_Types].xml',
			'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/></Types>',
		);
		zip.file('xl/workbook.bin', new Uint8Array([0x83, 0x01, 0x00]));
		const bytes = await zip.generateAsync({ type: 'uint8array' });
		expect(detectWorkbookFormat(bytes)).toBe('xlsb');
		const error = await loadWorkbook(bytes, { fileName: 'Report.xlsb' }).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(UnsupportedWorkbookError);
		expect((error as UnsupportedWorkbookError).code).toBe('xlsb-unsupported');
		expect((error as Error).message).toMatch(/\.xlsb\) files are not supported; save as \.xlsx/);
	});
});
