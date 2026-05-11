import { createHash } from "crypto"
import { fetch } from "@/shared/net"

export interface PoWChallenge {
	algorithm: string
	challenge: string
	salt: string
	signature: string
	difficulty: number
	expire_at: number
	expire_after: number
	target_path: string
}

export interface PoWAnswer {
	algorithm: string
	challenge: string
	salt: string
	answer: number
	signature: string
	target_path: string
}

const DEEPSEEK_HEADERS = {
	"x-app-version": "2.0.0",
	"x-client-locale": "en_US",
	"x-client-platform": "web",
	"x-client-version": "2.0.0",
	"x-client-timezone-offset": "10800",
	Origin: "https://chat.deepseek.com",
	Referer: "https://chat.deepseek.com/",
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
}

export function buildBaseHeaders(bearerToken: string, cookies?: string): Record<string, string> {
	return {
		...DEEPSEEK_HEADERS,
		"Content-Type": "application/json",
		Authorization: `Bearer ${bearerToken}`,
		...(cookies ? { Cookie: cookies } : {}),
	}
}

export async function fetchPoWChallenge(
	bearerToken: string,
	cookies?: string,
	targetPath = "/api/v0/chat/completion",
): Promise<PoWChallenge> {
	const resp = await fetch("https://chat.deepseek.com/api/v0/chat/create_pow_challenge", {
		method: "POST",
		headers: buildBaseHeaders(bearerToken, cookies),
		body: JSON.stringify({ target_path: targetPath }),
	})

	if (!resp.ok) {
		throw new Error(`PoW challenge request failed: ${resp.status} ${resp.statusText}`)
	}

	const json = (await resp.json()) as any
	if (json.code !== 0) {
		throw new Error(`PoW challenge API error ${json.code}: ${json.msg || JSON.stringify(json)}`)
	}

	return json.data.biz_data.challenge as PoWChallenge
}

/**
 * DeepSeekHashV1: SHA3-256(challenge + salt + nonce) where first 4 bytes as uint32BE
 * must be less than floor(2^32 / difficulty).
 * The browser loads sha3_wasm_bg — confirmed SHA3-256 by empirical testing.
 */
export function solvePoW(ch: PoWChallenge): PoWAnswer {
	const { algorithm, challenge, salt, signature, difficulty, target_path } = ch
	const target = Math.floor(0x100000000 / difficulty)

	for (let nonce = 0; ; nonce++) {
		const hash = createHash("sha3-256")
			.update(challenge + salt + nonce.toString(), "utf8")
			.digest()
		if (hash.readUInt32BE(0) < target) {
			return { algorithm, challenge, salt, answer: nonce, signature, target_path }
		}
	}
}

export function encodePoWAnswer(answer: PoWAnswer): string {
	return Buffer.from(JSON.stringify(answer)).toString("base64")
}

export async function getPoWHeader(bearerToken: string, cookies?: string): Promise<string> {
	const challenge = await fetchPoWChallenge(bearerToken, cookies)
	const answer = solvePoW(challenge)
	return encodePoWAnswer(answer)
}
