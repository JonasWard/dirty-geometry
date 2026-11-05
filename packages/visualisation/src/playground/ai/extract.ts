/** The code in a model's reply: the last fenced block that holds a definition, or the text from the definition on. */
export function extractCode(reply: string): string | undefined {
  // Some models wrap their reasoning in <think> tags before the answer.
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, '');
  const blocks = [...text.matchAll(/```[\w-]*[^\S\n]*\n([\s\S]*?)```/g)].map((m) => m[1]!.trim());
  const withDefinition = blocks.filter((block) => /export\s+function\s+definition\s*\(/.test(block));
  if (withDefinition.length) return withDefinition.at(-1);
  // No fence (or an unclosed one): from the first function or import to the end.
  const start = text.search(/^(import|function|export\s+function)\b/m);
  if (start < 0 || !/export\s+function\s+definition\s*\(/.test(text)) return undefined;
  return text
    .slice(start)
    .replace(/```\s*$/, '')
    .trim();
}
