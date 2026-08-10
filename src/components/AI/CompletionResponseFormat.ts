import type { ModelResponseFormat } from './types';

export const COMPLETION_RESPONSE_GRAMMAR = String.raw`
root ::= "<completion>" content "</completion>"
content ::= [\u0000-\U0010ffff]*
`.trim();

export const COMPLETION_RESPONSE_FORMAT: ModelResponseFormat = {
  type: 'grammar',
  grammar: COMPLETION_RESPONSE_GRAMMAR,
};
