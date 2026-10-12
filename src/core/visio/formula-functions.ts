import { isClassifiedVisioFunction } from './formula-evaluate';
import { unquotedVisioFormula } from './formula-source';

/**
 * ShapeSheet functions Visio documents, by name. The inventory exists so that whole-shape
 * commands (reorder, duplicate, paste, group) can tell a formula made of known functions from one
 * that calls something this editor has never heard of, which is still refused. It is a list of
 * names, not of evaluated functions.
 */
const DOCUMENTED = new Set(
	`ABS ACOS AND ANG360 ANGLEALONGPATH ANGLETOLOC ANGLETOPAR ASIN ATAN ATAN2 BITAND BITNOT BITOR
	BITXOR BKGPAGENAME BLEND BLOB BLUE BOUND CALLOUTCOUNT CALLOUTTARGETREF CALLTHIS CATEGORY CEILING
	CELLISTHEMED CHAR COMPANY CONTAINERCOUNT CONTAINERMEMBERCOUNT CONTAINERSHEETREF COS COSH CREATOR
	CY DATA1 DATA2 DATA3 DATE DATETIME DATEVALUE DAY DAYOFYEAR DECIMALSEP DEFAULTEVENT DEG DEPENDSON
	DESCRIPTION DIRECTORY DISTTOPATH DOCCREATION DOCLASTEDIT DOCLASTPRINT DOCLASTSAVE DOCMD
	DOOLEVERB EVALCELL EVALTEXT FIELDPICTURE FILENAME FIND FLOOR FONT FONTTOID FORMAT FORMATEX
	FORMULAEXISTS GETATREF GETREF GETVAL GOTOPAGE GRAVITY GREEN GUARD HASCATEGORY HELP HOUR HSL HUE
	HUEDIFF HYPERLINK HYPERLINKBASE ID IF IFERROR INDEX INDIRECT INT INTERSECTX INTERSECTY INTUP
	IS1D ISERR ISERRNA ISERROR ISERRVALUE ISTHEMED KEYWORDS LEFT LEN LISTMEMBERCOUNT LISTORDER
	LISTSEP LISTSHEETREF LN LOC LOCALFORMULAEXISTS LOCTOLOC LOCTOPAR LOG10 LOOKUP LOWER LUM LUMDIFF
	MANAGER MASTERNAME MAX MEMBERSHEETREF MID MIN MINUTE MODULUS MONTH MSOSHADE MSOTINT NA NAME
	NEARESTPOINTONPATH NOT NOW NURBS OPENFILE OPENGROUPWIN OPENSHEETWIN OPENTEXTWIN OR PAGECOUNT
	PAGENAME PAGENUMBER PAR PARENT PATHLENGTH PATHSEGMENT PI PLAYSOUND PNT PNTX PNTY POINTALONGPATH
	POLYLINE POW PRINTSHEETCOUNT QUEUEMARKEREVENT RAD RAND RECTSECT RED REF REPLACE REWIDEN RGB
	RIGHT ROUND RUNADDON RUNADDONWARGS RUNMACRO SAT SATDIFF SECOND SEGMENTCOUNT SETATREF
	SETATREFEVAL SETATREFEXPR SETF SHADE SHAPETEXT SHEETREF SIGN SIN SINH SQRT STRSAME STRSAMEEX
	SUBJECT SUBSTITUTE SUM TAN TANH TEXTHEIGHT TEXTWIDTH THEME THEMEGUARD THEMEPROP THEMERESTORE
	THEMEVAL TIME TIMEVALUE TINT TITLE TONE TRIM TRUNC TYPE TYPEDESC UNICHAR UPPER USE USERUI
	VERSION WEEKDAY YEAR`
		.split(/\s+/)
		.filter(Boolean),
);

/** Function names a formula calls, read from its syntax so unparsable formulas are covered too. */
export function visioFormulaFunctions(source: string): string[] {
	return [
		...new Set(
			(unquotedVisioFormula(source).match(/[A-Za-z_][A-Za-z_0-9]*(?=\s*\()/g) ?? []).map((name) =>
				name.toUpperCase(),
			),
		),
	];
}

/** A function Visio documents, one the analyser classifies, or an internal `_NAME` helper. */
export const isKnownVisioFunction = (name: string): boolean =>
	DOCUMENTED.has(name.toUpperCase()) ||
	isClassifiedVisioFunction(name.toUpperCase()) ||
	/^_[A-Z_0-9]+$/i.test(name);

/** Functions that build a cell reference from text: an edit could change what one resolves to. */
export const VISIO_TEXT_REFERENCE_FUNCTIONS: ReadonlySet<string> = new Set([
	'INDIRECT',
	'EVALCELL',
	'EVALTEXT',
	'REF',
]);

/**
 * Functions that look a shape up through its containers, lists or callouts. Which sheet they
 * find can depend on how containers are stacked and nested, so they matter when the shape being
 * reordered, copied or grouped is itself a container or a list.
 */
export const VISIO_STRUCTURE_FUNCTIONS: ReadonlySet<string> = new Set([
	'CONTAINERSHEETREF',
	'MEMBERSHEETREF',
	'LISTSHEETREF',
	'CALLOUTTARGETREF',
	'CONTAINERCOUNT',
	'CONTAINERMEMBERCOUNT',
	'LISTMEMBERCOUNT',
	'LISTORDER',
	'CALLOUTCOUNT',
]);
