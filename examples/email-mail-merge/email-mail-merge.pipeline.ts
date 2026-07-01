import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePipeline } from '@scriptpipe/core';
import { ingestContacts } from './steps/ingest-contacts';
import { cleanContacts } from './steps/clean-contacts';
import { renderEmails } from './steps/render-emails';

// Assets are located relative to this file so the pipeline runs from any working directory.
const here = dirname(fileURLToPath(import.meta.url));
const at = (relativePath: string): string => join(here, relativePath);

/**
 * An email list flows through every layer to produce mail-merged emails:
 *
 *   source  contacts.csv + welcome.txt
 *      -> bronze  raw contacts captured as JSON
 *      -> silver  cleaned, validated contacts
 *      -> gold    rendered emails, ready for a consuming app to send
 *
 * Gold is the terminal layer — delivery (the "sink") is the consuming app's job.
 * Execution order is derived from each step's reads/writes — not declared by hand.
 */
export default definePipeline('email-mail-merge', {
  assets: {
    contactList: { layer: 'source', uri: at('data/source/contacts.csv') },
    emailTemplate: { layer: 'source', uri: at('templates/welcome.txt') },
    rawContacts: { layer: 'bronze', uri: at('data/bronze/contacts.json') },
    cleanedContacts: { layer: 'silver', uri: at('data/silver/contacts.json') },
    mergedEmails: { layer: 'gold', uri: at('data/gold/emails.json') },
  },
  steps: {
    ingestContacts: {
      kind: 'deterministic',
      reads: ['contactList'],
      writes: ['rawContacts'],
      run: ingestContacts,
    },
    cleanContacts: {
      kind: 'deterministic',
      reads: ['rawContacts'],
      writes: ['cleanedContacts'],
      run: cleanContacts,
    },
    renderEmails: {
      kind: 'deterministic',
      reads: ['cleanedContacts', 'emailTemplate'],
      writes: ['mergedEmails'],
      run: renderEmails,
    },
  },
});
