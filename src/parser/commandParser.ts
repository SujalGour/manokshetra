/** Non-move things the player can say. */
export type Command = 'yes' | 'no' | 'repeat' | 'why' | 'peek' | 'resign' | 'help';

const PATTERNS: [Command, RegExp][] = [
  ['yes', /^(yes|yeah|yep|yup|correct|confirm(ed)?|right|sure|ok(ay)?|do it|play it|that'?s right)\b/],
  ['no', /^(no|nope|nah|cancel|wrong|not that|incorrect)\b/],
  ['why', /\b(why|explain|what'?s wrong|reason)\b/],
  ['repeat', /\b(repeat|say (it |that )?again|again|what did you (play|move|say)|(your|last) move|pardon|come again)\b/],
  ['peek', /\b(peek|show( me)?( the)? board|divya\w*|let me see|look at( the)? board)\b/],
  ['resign', /\b(resign|i give up|give up)\b/],
  ['help', /\b(help|what can i say|commands)\b/],
];

export function parseCommand(text: string): Command | null {
  const t = text.toLowerCase().replace(/[.,!?]/g, '').trim();
  for (const [cmd, re] of PATTERNS) if (re.test(t)) return cmd;
  return null;
}
