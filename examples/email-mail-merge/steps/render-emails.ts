import { readJson, readText, writeJson } from '@scriptpipe/core';
import type { StepContext } from '@scriptpipe/core';
import type { CleanContact } from './clean-contacts';

/** A fully rendered email, ready for a consuming app to send. */
export interface MergedEmail {
  to: string;
  subject: string;
  body: string;
}

/** Replace `{{placeholder}}` tokens, throwing on any placeholder we cannot fill. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) {
      throw new Error(`Template references unknown placeholder "{{${key}}}".`);
    }
    return values[key]!;
  });
}

/**
 * silver + source(template) -> gold: merge each clean contact into the email template.
 * This step reads two assets — the cleaned contacts and the template.
 */
export async function renderEmails(ctx: StepContext): Promise<void> {
  const contacts = readJson<CleanContact[]>(ctx.reads.cleanedContacts!);
  const template = readText(ctx.reads.emailTemplate!);

  const emails: MergedEmail[] = contacts.map((contact) => {
    const rendered = fillTemplate(template, {
      firstName: contact.firstName,
      fullName: contact.fullName,
      company: contact.company,
      plan: contact.plan,
    });

    const [subjectLine, ...rest] = rendered.split('\n');
    const subject = subjectLine!.replace(/^Subject:\s*/, '');
    const body = rest.join('\n').trim();
    return { to: contact.email, subject, body };
  });

  writeJson(ctx.writes.mergedEmails!, emails);
  ctx.logger.info(`  rendered ${emails.length} email(s) from the template`);
}
