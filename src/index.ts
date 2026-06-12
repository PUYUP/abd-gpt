import OpenAI from 'openai';

export interface Env {
	OPENAI_API_KEY: string;
}

interface RequestBody {
	content: string;
}

interface BookInfo {
	title: string;
	reading_time_minutes: number;
	from_page: number;
	to_page: number;
}

const MODEL = 'gpt-4o-mini';
const MAX_CONTENT_LENGTH = 500;
const TIMEOUT_MS = 15000;

let openaiClient: OpenAI | null = null;

function getOpenAI(apiKey: string): OpenAI {
	if (!openaiClient) {
		openaiClient = new OpenAI({
			apiKey,
		});
	}

	return openaiClient;
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

const securityHeaders = {
	'Content-Type': 'application/json; charset=utf-8',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'no-referrer',
	'Cache-Control': 'no-store',
};

function json(
	data: unknown,
	status = 200
): Response {
	return new Response(
		JSON.stringify(data),
		{
			status,
			headers: {
				...corsHeaders,
				...securityHeaders,
			},
		}
	);
}

function validateInput(
	body: unknown
): RequestBody {
	if (
		typeof body !== 'object' ||
		body === null
	) {
		throw new Error(
			'Request body must be an object'
		);
	}

	const { content } =
		body as Record<string, unknown>;

	if (
		typeof content !== 'string' ||
		!content.trim()
	) {
		throw new Error(
			'content is required'
		);
	}

	if (
		content.length >
		MAX_CONTENT_LENGTH
	) {
		throw new Error(
			'content too long'
		);
	}

	return {
		content: content.trim(),
	};
}

function validateBookInfo(
	data: any
): BookInfo {
	if (
		typeof data?.title !== 'string' ||
		data.title.trim() === ''
	) {
		throw new Error(
			'Invalid title'
		);
	}

	if (
		typeof data.reading_time_minutes !==
		'number' ||
		data.reading_time_minutes <= 0
	) {
		throw new Error(
			'Invalid reading_time_minutes'
		);
	}

	if (
		typeof data.from_page !==
		'number' ||
		data.from_page < 0
	) {
		throw new Error(
			'Invalid from_page'
		);
	}

	if (
		typeof data.to_page !==
		'number' ||
		data.to_page <
		data.from_page
	) {
		throw new Error(
			'Invalid to_page'
		);
	}

	return {
		title: data.title.trim(),
		reading_time_minutes:
			Math.round(
				data.reading_time_minutes
			),
		from_page:
			Math.round(
				data.from_page
			),
		to_page:
			Math.round(
				data.to_page
			),
	};
}

const schema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		title: {
			type: 'string',
		},
		reading_time_minutes: {
			type: 'integer',
		},
		from_page: {
			type: 'integer',
		},
		to_page: {
			type: 'integer',
		},
	},
	required: [
		'title',
		'reading_time_minutes',
		'from_page',
		'to_page',
	],
};

async function getBookInfo(
	content: string,
	apiKey: string
): Promise<BookInfo> {
	const openai =
		getOpenAI(apiKey);

	const controller =
		new AbortController();

	const timeout =
		setTimeout(
			() =>
				controller.abort(),
			TIMEOUT_MS
		);

	try {
		const response =
			await openai.responses.create(
				{
					model: MODEL,

					temperature: 0,

					max_output_tokens:
						200,

					input: [
						{
							role: 'system',
							content:
								`Determine the book information.

Return:
- title
- reading_time_minutes
- from_page
- to_page

If exact values are unknown,
estimate realistically.`,
						},
						{
							role: 'user',
							content,
						},
					],

					text: {
						format: {
							type: 'json_schema',
							name: 'book_info',
							schema,
						},
					},
				},
				{
					signal:
						controller.signal,
				}
			);

		if (
			!response.output_text
		) {
			throw new Error(
				'Empty OpenAI response'
			);
		}

		const parsed =
			JSON.parse(
				response.output_text
			);

		return validateBookInfo(
			parsed
		);
	} finally {
		clearTimeout(timeout);
	}
}

export default {
	async fetch(
		request: Request,
		env: Env
	): Promise<Response> {
		if (
			request.method ===
			'OPTIONS'
		) {
			return new Response(
				null,
				{
					status: 204,
					headers:
						corsHeaders,
				}
			);
		}

		if (
			request.method !==
			'POST'
		) {
			return json(
				{
					error:
						'Method not allowed',
				},
				405
			);
		}

		if (
			!env.OPENAI_API_KEY
		) {
			return json(
				{
					error:
						'Server misconfiguration',
				},
				500
			);
		}

		try {
			const body =
				await request.json();

			const {
				content,
			} =
				validateInput(
					body
				);

			const result =
				await getBookInfo(
					content,
					env.OPENAI_API_KEY
				);

			return json(result);
		} catch (error) {
			console.error(error);

			const message =
				error instanceof Error
					? error.message
					: 'Internal Server Error';

			if (
				message ===
				'content is required' ||
				message ===
				'content too long' ||
				message ===
				'Request body must be an object'
			) {
				return json(
					{
						error:
							message,
					},
					400
				);
			}

			if (
				message.includes(
					'abort'
				)
			) {
				return json(
					{
						error:
							'OpenAI timeout',
					},
					504
				);
			}

			return json(
				{
					error:
						'Internal Server Error',
				},
				500
			);
		}
	},
} satisfies ExportedHandler<Env>;