// Text decoding for CSV and other plain-text spreadsheet input. Excel's "CSV" (not "CSV UTF-8")
// is written in the system ANSI code page, which on Western Windows is Windows-1252, without a
// byte-order mark; decoding such a file as UTF-8 turns every accented letter into U+FFFD.

// Windows-1252 code points for bytes 0x80-0x9F (the five undefined bytes stay C1 controls,
// like the WHATWG decoder). Some runtimes' `windows-1252` TextDecoder is plain Latin-1.
const CP1252_HIGH = [
	0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
	0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
	0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function decodeWindows1252(bytes: Uint8Array): string {
	let out = '';
	for (const b of bytes)
		out += String.fromCharCode(b >= 0x80 && b <= 0x9f ? (CP1252_HIGH[b - 0x80] ?? b) : b);
	return out;
}

/**
 * Decodes spreadsheet text bytes: a UTF-16 LE/BE or UTF-8 byte-order mark wins; otherwise the
 * bytes are decoded as UTF-8 when they are valid UTF-8 and as Windows-1252 when they are not.
 * The byte-order mark is not part of the result.
 */
export function decodeSpreadsheetText(bytes: Uint8Array): string {
	if (bytes[0] === 0xff && bytes[1] === 0xfe)
		return new TextDecoder('utf-16le').decode(bytes.subarray(2));
	if (bytes[0] === 0xfe && bytes[1] === 0xff)
		return new TextDecoder('utf-16be').decode(bytes.subarray(2));
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
		return new TextDecoder('utf-8').decode(bytes.subarray(3));
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return decodeWindows1252(bytes);
	}
}
