/** The JSON in a model's reply: the last fenced block holding an object, or the text from the first `{` to the last `}`. */
export function extractJson(reply: string): string | undefined {
  // Some models wrap their reasoning in <think> tags before the answer.
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, '');
  const blocks = [...text.matchAll(/```[\w-]*[^\S\n]*\n([\s\S]*?)```/g)]
    .map((m) => m[1]!.trim())
    .filter((block) => block.startsWith('{'));
  if (blocks.length) return blocks.at(-1);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}
