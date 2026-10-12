import crypto from 'node:crypto';

import forge from 'node-forge';
import { describe, expect, it } from 'vitest';

import { validateCertificateChain } from './certificate-utils';

interface Party {
	cert: forge.pki.Certificate;
	key: forge.pki.rsa.PrivateKey;
	pem: string;
	base64: string;
}

function keyPair() {
	const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	return {
		privateKey: forge.pki.privateKeyFromPem(
			privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
		) as forge.pki.rsa.PrivateKey,
		publicKey: forge.pki.publicKeyFromPem(
			publicKey.export({ type: 'spki', format: 'pem' }) as string,
		) as forge.pki.rsa.PublicKey,
	};
}

interface Options {
	name: string;
	issuer?: Party;
	ca: boolean;
	notBefore?: Date;
	notAfter?: Date;
}

function party({ name, issuer, ca, notBefore, notAfter }: Options): Party {
	const { privateKey, publicKey } = keyPair();
	const cert = forge.pki.createCertificate();
	cert.publicKey = publicKey;
	cert.serialNumber = String(Math.floor(Math.random() * 1e9) + 1);
	cert.validity.notBefore = notBefore ?? new Date(Date.now() - 24 * 3600 * 1000);
	cert.validity.notAfter = notAfter ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);
	const subject = [{ name: 'commonName', value: name }];
	cert.setSubject(subject);
	cert.setIssuer(issuer ? issuer.cert.subject.attributes : subject);
	cert.setExtensions([{ name: 'basicConstraints', cA: ca }]);
	cert.sign(issuer ? issuer.key : privateKey, forge.md.sha256.create());
	const pem = forge.pki.certificateToPem(cert);
	const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
	return { cert, key: privateKey, pem, base64: forge.util.encode64(der) };
}

describe('validateCertificateChain', () => {
	const root = party({ name: 'Test Root', ca: true });
	const intermediate = party({ name: 'Test Intermediate', issuer: root, ca: true });
	const leaf = party({ name: 'Test Leaf', issuer: intermediate, ca: false });

	it('reports not-checked when there are no certificates', () => {
		expect(validateCertificateChain([], [])).toEqual({ status: 'not-checked' });
	});

	it('trusts a leaf, intermediate and root chain anchored in an additional root', () => {
		const result = validateCertificateChain(
			[leaf.base64, intermediate.base64, root.base64],
			[root.pem],
		);
		expect(result).toEqual({ status: 'trusted' });
	});

	it('trusts a chain that stops at the intermediate when its issuer is a trusted root', () => {
		const result = validateCertificateChain([leaf.base64, intermediate.base64], [root.pem]);
		expect(result).toEqual({ status: 'trusted' });
	});

	it('does not trust a chain whose root is not trusted', () => {
		const result = validateCertificateChain([leaf.base64, intermediate.base64, root.base64], []);
		expect(result.status).toBe('untrusted');
	});

	it('does not trust a chain anchored in a different root', () => {
		const other = party({ name: 'Other Root', ca: true });
		const result = validateCertificateChain(
			[leaf.base64, intermediate.base64, root.base64],
			[other.pem],
		);
		expect(result.status).toBe('untrusted');
	});

	it('does not trust an expired leaf', () => {
		const expired = party({
			name: 'Expired Leaf',
			issuer: intermediate,
			ca: false,
			notBefore: new Date(Date.now() - 400 * 24 * 3600 * 1000),
			notAfter: new Date(Date.now() - 24 * 3600 * 1000),
		});
		const result = validateCertificateChain(
			[expired.base64, intermediate.base64, root.base64],
			[root.pem],
		);
		expect(result.status).toBe('untrusted');
	});

	it('does not accept an issuer that is not a CA', () => {
		const notCa = party({ name: 'Not A CA', issuer: root, ca: false });
		const child = party({ name: 'Child', issuer: notCa, ca: false });
		const result = validateCertificateChain([child.base64, notCa.base64], [root.pem]);
		expect(result.status).toBe('untrusted');
	});

	it('does not accept a certificate whose signature was altered', () => {
		const der = Buffer.from(leaf.base64, 'base64');
		der[der.length - 1] = der[der.length - 1]! ^ 0xff;
		const result = validateCertificateChain(
			[der.toString('base64'), intermediate.base64, root.base64],
			[root.pem],
		);
		expect(result.status).toBe('untrusted');
	});

	it('does not accept a leaf presented with an unrelated issuer', () => {
		const stranger = party({ name: 'Stranger', ca: true });
		const result = validateCertificateChain([leaf.base64, stranger.base64], [stranger.pem]);
		expect(result.status).toBe('untrusted');
	});

	it('reports a malformed certificate as untrusted instead of throwing', () => {
		const result = validateCertificateChain(['bm90IGEgY2VydGlmaWNhdGU='], [root.pem]);
		expect(result.status).toBe('untrusted');
		expect(result.error).toMatch(/validation failed/);
	});
});
