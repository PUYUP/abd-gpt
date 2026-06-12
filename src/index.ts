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

const openAISchema = {
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

export default {
	async fetch(
		request: Request,
		env: Env
	): Promise<Response> {
		try {
			if (request.method !== 'POST') {
				return Response.json(
					{
						error: 'Method not allowed',
					},
					{
						status: 405,
					}
				);
			}

			const body = (await request.json()) as RequestBody;

			if (
				!body.content ||
				typeof body.content !== 'string'
			) {
				return Response.json(
					{
						error: 'content is required',
					},
					{
						status: 400,
					}
				);
			}

			const openai = new OpenAI({
				apiKey: env.OPENAI_API_KEY,
			});

			const response =
				await openai.responses.create({
					model: 'gpt-4o-mini',

					input: [
						{
							role: 'system',
							content: `
Determine the book information.

Return:
- title
- reading_time_minutes
- from_page
- to_page

If exact data is unavailable,
estimate realistically.
`,
						},
						{
							role: 'user',
							content: body.content,
						},
					],

					text: {
						format: {
							type: 'json_schema',
							name: 'book_info',
							schema: openAISchema,
						},
					},
				});

			const result = JSON.parse(
				response.output_text
			) as BookInfo;

			return Response.json(result);
		} catch (error: any) {
			console.error(error);

			return Response.json(
				{
					error:
						error?.message ??
						'Internal Server Error',
				},
				{
					status: 500,
				}
			);
		}
	},
} satisfies ExportedHandler<Env>;