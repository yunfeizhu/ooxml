import { parseAppProperties, parseCoreProperties } from '../opc/properties/index';
import { RELATIONSHIP_TYPES as REL_TYPES } from '../opc/relationship-types';
import type { VisioPackage } from './package';
import type { VisioFieldProperties } from './text-fields';

const MAX_PROPERTY_BYTES = 1024 * 1024;

/** Read the core and extended properties a text field can show. Missing or unreadable parts are
 * omitted: fields then keep their cached text. */
export async function readVisioFieldProperties(pkg: VisioPackage): Promise<VisioFieldProperties> {
	const result: VisioFieldProperties = {};
	let relationships;
	try {
		relationships = [...(await pkg.relationships('')).values()];
	} catch {
		return result;
	}
	const read = async (type: string): Promise<string | undefined> => {
		const relationship = relationships.find((rel) => rel.type === type && rel.mode === 'Internal');
		if (!relationship || !pkg.has(relationship.target)) return undefined;
		if (pkg.getPartByteLength(relationship.target) > MAX_PROPERTY_BYTES) return undefined;
		try {
			return new TextDecoder().decode(await pkg.readBytes(relationship.target));
		} catch {
			return undefined;
		}
	};
	const keep = (key: keyof VisioFieldProperties, value: string | undefined) => {
		if (typeof value === 'string' && value.length <= 4096) result[key] = value;
	};
	try {
		const core = parseCoreProperties(await read(REL_TYPES.coreProperties));
		for (const key of [
			'title',
			'subject',
			'creator',
			'keywords',
			'description',
			'category',
			'created',
			'modified',
			'lastPrinted',
		] as const)
			keep(key, core[key]);
	} catch {
		/* Unreadable core properties leave document fields cached. */
	}
	try {
		const app = parseAppProperties(await read(REL_TYPES.extendedProperties));
		keep('company', app.company);
		keep('manager', app.manager);
	} catch {
		/* Unreadable extended properties leave document fields cached. */
	}
	return result;
}
